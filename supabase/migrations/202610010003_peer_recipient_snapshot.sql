-- Keep the recipient identity in a sent receipt stable without exposing
-- another member's profile row through table-level RLS.
alter table public.peer_transfers
  add column if not exists receiver_name_snapshot text not null default '';

update public.peer_transfers t
  set receiver_name_snapshot = coalesce(p.display_name, '')
  from public.profiles p
  where p.id = t.receiver_user_id and t.receiver_name_snapshot = '';

create or replace function public.respond_to_peer_exchange(p_exchange_id uuid,p_nonce text,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare e public.peer_exchange_sessions%rowtype; l public.peer_share_links%rowtype; c public.tap_cards%rowtype; transfer_id uuid:=gen_random_uuid(); snapshots jsonb; sender_name text; receiver_name text; field_total integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_accept is null then raise exception 'Consent decision is required' using errcode='22023'; end if;
  select * into e from public.peer_exchange_sessions where id=p_exchange_id for update;
  if not found or e.receiver_user_id<>auth.uid() then raise exception 'Tap Card exchange not found' using errcode='P0002'; end if;
  if e.expires_at<=now() then update public.peer_exchange_sessions set status='expired' where id=e.id and status='pending'; raise exception 'This Tap Card exchange expired' using errcode='P0001'; end if;
  if e.status<>'pending' or p_nonce is null or p_nonce !~ '^[0-9a-f]{32}$' or e.nonce_hash<>encode(extensions.digest(p_nonce,'sha256'),'hex') then raise exception 'This Tap Card exchange is invalid or already answered' using errcode='23505'; end if;
  select * into l from public.peer_share_links where id=e.link_id for update;
  if not found or l.revoked_at is not null or l.used_at is not null or l.expires_at is not null and l.expires_at<=now() then raise exception 'This Tap Card link has expired or was revoked' using errcode='P0001'; end if;
  if not p_accept then
    update public.peer_exchange_sessions set status='declined' where id=e.id;
    if l.reserved_exchange_id=e.id then update public.peer_share_links set reserved_exchange_id=null where id=l.id; end if;
    return jsonb_build_object('status','declined');
  end if;
  if l.card_id is null then raise exception 'This Tap Card has been removed' using errcode='P0001'; end if;
  select * into c from public.tap_cards where id=l.card_id and user_id=l.owner_user_id and archived_at is null and (expires_at is null or expires_at>now());
  if not found then raise exception 'This Tap Card has expired' using errcode='P0001'; end if;
  if cardinality(e.field_keys_snapshot) not between 1 and 20 then raise exception 'The reviewed Tap Card fields are unavailable' using errcode='23514'; end if;
  if exists(select 1 from unnest(e.field_keys_snapshot) f(field_key) left join public.personal_fields v on v.user_id=e.sender_user_id and v.field_key=f.field_key where coalesce(trim(v.value),'')='') then
    raise exception 'The Tap Card owner needs to update missing Vault details' using errcode='23514';
  end if;
  select jsonb_object_agg(f.field_key,v.value order by f.ordinality),count(*) into snapshots,field_total
    from unnest(e.field_keys_snapshot) with ordinality as f(field_key,ordinality)
    join public.personal_fields v on v.user_id=e.sender_user_id and v.field_key=f.field_key;
  sender_name:=e.sender_name_snapshot;
  select coalesce(display_name,'') into receiver_name from public.profiles where id=e.receiver_user_id;
  insert into public.peer_transfers(id,exchange_id,sender_user_id,receiver_user_id,card_name_snapshot,sender_name_snapshot,receiver_name_snapshot,values_snapshot,field_count)
    values(transfer_id,e.id,e.sender_user_id,e.receiver_user_id,l.card_name_snapshot,coalesce(sender_name,''),coalesce(receiver_name,''),snapshots,field_total);
  insert into public.received_cards(transfer_id,receiver_user_id) values(transfer_id,e.receiver_user_id);
  update public.peer_exchange_sessions set status='completed',completed_at=now() where id=e.id;
  if l.one_time then update public.peer_share_links set used_at=now(),reserved_exchange_id=null where id=l.id; end if;
  return jsonb_build_object('status','completed','transferId',transfer_id,'fieldCount',field_total);
end $$;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select jsonb_build_object(
    'exportedAt',now(),'profile',(to_jsonb(p)-'id')||jsonb_build_object('email',(select u.email from auth.users u where u.id=auth.uid())),'vault',coalesce((select jsonb_object_agg(field_key,value) from public.personal_fields where user_id=auth.uid()),'{}'::jsonb),
    'tapCards',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'category',c.category,'expiresAt',c.expires_at,'fields',coalesce((select jsonb_agg(f.field_key order by f.display_order) from public.tap_card_fields f where f.card_id=c.id),'[]'::jsonb))) from public.tap_cards c where c.user_id=auth.uid()),'[]'::jsonb),
    'organizationRequests',coalesce((select jsonb_agg(jsonb_build_object('status',r.status,'createdAt',r.created_at,'organization',o.name,'template',v.name,'shared',coalesce((select jsonb_object_agg(sv.field_key,sv.value_snapshot) from public.shared_values sv where sv.response_id=r.id),'{}'::jsonb),'answers',r.answers))
      from public.request_responses r join public.request_sessions s on s.id=r.session_id join public.organizations o on o.id=s.organization_id join public.request_template_versions v on v.id=s.template_version_id where r.personal_user_id=auth.uid()),'[]'::jsonb),
    'requestHistory',coalesce((select jsonb_agg(jsonb_build_object('status',s.status,'createdAt',s.created_at,'expiresAt',s.expires_at,'organization',o.name,'template',v.name,'purpose',v.purpose,'responseStatus',r.status))
      from public.request_sessions s join public.organizations o on o.id=s.organization_id join public.request_template_versions v on v.id=s.template_version_id left join public.request_responses r on r.session_id=s.id where s.joined_user_id=auth.uid()),'[]'::jsonb),
    'receivedCards',coalesce((select jsonb_agg(jsonb_build_object('sender',t.sender_name_snapshot,'card',t.card_name_snapshot,'values',t.values_snapshot,'completedAt',t.completed_at,'saved',r.saved_at is not null))
      from public.received_cards r join public.peer_transfers t on t.id=r.transfer_id where r.receiver_user_id=auth.uid()),'[]'::jsonb),
    'sentPeerTransfers',coalesce((select jsonb_agg(jsonb_build_object('recipient',t.receiver_name_snapshot,'card',t.card_name_snapshot,'fieldCount',t.field_count,'values',t.values_snapshot,'completedAt',t.completed_at))
      from public.peer_transfers t where t.sender_user_id=auth.uid()),'[]'::jsonb)
  ) into result from public.profiles p where p.id=auth.uid();
  return coalesce(result,'{}'::jsonb);
end $$;
