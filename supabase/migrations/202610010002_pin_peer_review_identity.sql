-- The name shown to a receiver at review must remain the name on the receipt,
-- even if the sender edits their profile while the exchange is pending.
alter table public.peer_exchange_sessions
  add column if not exists sender_name_snapshot text not null default '';

update public.peer_exchange_sessions e
  set sender_name_snapshot = coalesce(p.display_name, '')
  from public.profiles p
  where p.id = e.sender_user_id and e.status = 'pending';

create or replace function public.join_card_share(p_token text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare l public.peer_share_links%rowtype; c public.tap_cards%rowtype; e public.peer_exchange_sessions%rowtype; new_id uuid:=gen_random_uuid(); raw_nonce text; field_keys text[]; now_at timestamptz:=now();
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' or p_idempotency_key is null then raise exception 'Invalid share link' using errcode='22023'; end if;
  select * into l from public.peer_share_links where token_hash=encode(extensions.digest(lower(p_token),'sha256'),'hex') for update;
  if not found or l.revoked_at is not null or l.expires_at is not null and l.expires_at<=now_at or l.used_at is not null then raise exception 'This Tap Card link has expired or is no longer available' using errcode='P0001'; end if;
  if l.owner_user_id=auth.uid() or l.target_user_id is not null and l.target_user_id<>auth.uid() then raise exception 'This Tap Card is not available to this account' using errcode='42501'; end if;
  if l.card_id is null then raise exception 'This Tap Card has been removed' using errcode='P0001'; end if;
  select * into c from public.tap_cards where id=l.card_id and user_id=l.owner_user_id for share;
  if not found or c.archived_at is not null or c.expires_at is not null and c.expires_at<=now_at then raise exception 'This Tap Card has expired' using errcode='P0001'; end if;
  select array_agg(f.field_key order by f.display_order) into field_keys from public.tap_card_fields f where f.card_id=c.id and f.user_id=c.user_id;
  if coalesce(cardinality(field_keys),0) not between 1 and 20 then raise exception 'This Tap Card has no shareable fields' using errcode='P0001'; end if;
  select * into e from public.peer_exchange_sessions where link_id=l.id and idempotency_key=p_idempotency_key;
  if found then
    if e.receiver_user_id<>auth.uid() or e.status<>'pending' or e.expires_at<=now_at then raise exception 'This Tap Card request is no longer available' using errcode='P0001'; end if;
    raw_nonce:=substr(encode(extensions.digest(lower(p_token)||p_idempotency_key::text||e.id::text,'sha256'),'hex'),1,32);
  else
    if l.one_time and l.reserved_exchange_id is not null then
      select * into e from public.peer_exchange_sessions where id=l.reserved_exchange_id;
      if found and e.status='pending' and e.expires_at>now_at then raise exception 'This one-time Tap Card is already being reviewed' using errcode='23505'; end if;
    end if;
    raw_nonce:=substr(encode(extensions.digest(lower(p_token)||p_idempotency_key::text||new_id::text,'sha256'),'hex'),1,32);
    insert into public.peer_exchange_sessions(id,link_id,sender_user_id,receiver_user_id,idempotency_key,nonce_hash,field_keys_snapshot,sender_name_snapshot,expires_at)
      values(new_id,l.id,l.owner_user_id,auth.uid(),p_idempotency_key,encode(extensions.digest(raw_nonce,'sha256'),'hex'),field_keys,
        coalesce((select display_name from public.profiles where id=l.owner_user_id),''),
        least(coalesce(l.expires_at,now_at+interval '10 minutes'),now_at+interval '10 minutes')) returning * into e;
    if l.one_time then update public.peer_share_links set reserved_exchange_id=e.id where id=l.id; end if;
  end if;
  return jsonb_build_object('exchangeId',e.id,'nonce',raw_nonce,'expiresAt',e.expires_at,'senderName',e.sender_name_snapshot,
    'cardName',l.card_name_snapshot,'fields',coalesce((select jsonb_agg(jsonb_build_object('key',f.field_key,'displayOrder',f.ordinality-1) order by f.ordinality)
      from unnest(e.field_keys_snapshot) with ordinality as f(field_key,ordinality)),'[]'::jsonb));
end $$;

create or replace function public.respond_to_peer_exchange(p_exchange_id uuid,p_nonce text,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare e public.peer_exchange_sessions%rowtype; l public.peer_share_links%rowtype; c public.tap_cards%rowtype; transfer_id uuid:=gen_random_uuid(); snapshots jsonb; sender_name text; field_total integer;
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
  insert into public.peer_transfers(id,exchange_id,sender_user_id,receiver_user_id,card_name_snapshot,sender_name_snapshot,values_snapshot,field_count)
    values(transfer_id,e.id,e.sender_user_id,e.receiver_user_id,l.card_name_snapshot,coalesce(sender_name,''),snapshots,field_total);
  insert into public.received_cards(transfer_id,receiver_user_id) values(transfer_id,e.receiver_user_id);
  update public.peer_exchange_sessions set status='completed',completed_at=now() where id=e.id;
  if l.one_time then update public.peer_share_links set used_at=now(),reserved_exchange_id=null where id=l.id; end if;
  return jsonb_build_object('status','completed','transferId',transfer_id,'fieldCount',field_total);
end $$;
