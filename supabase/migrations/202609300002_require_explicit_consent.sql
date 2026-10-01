-- Treat an omitted consent boolean as invalid. In PL/pgSQL, `if not NULL`
-- does not enter the decline branch, so accepting NULL would otherwise fall
-- through into the transfer path.
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
  select display_name into sender_name from public.profiles where id=e.sender_user_id;
  insert into public.peer_transfers(id,exchange_id,sender_user_id,receiver_user_id,card_name_snapshot,sender_name_snapshot,values_snapshot,field_count)
    values(transfer_id,e.id,e.sender_user_id,e.receiver_user_id,l.card_name_snapshot,coalesce(sender_name,''),snapshots,field_total);
  insert into public.received_cards(transfer_id,receiver_user_id) values(transfer_id,e.receiver_user_id);
  update public.peer_exchange_sessions set status='completed',completed_at=now() where id=e.id;
  if l.one_time then update public.peer_share_links set used_at=now(),reserved_exchange_id=null where id=l.id; end if;
  return jsonb_build_object('status','completed','transferId',transfer_id,'fieldCount',field_total);
end $$;

create or replace function public.respond_to_request(
  p_session_id uuid,p_approved boolean,p_approved_keys text[],p_answers jsonb,p_missing_values jsonb,p_save_missing_keys text[]
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare s public.request_sessions%rowtype; l public.organization_request_links%rowtype; new_response_id uuid:=gen_random_uuid(); missing_keys text[]; answer_count smallint:=0; shared_count smallint:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_approved is null then raise exception 'Consent decision is required' using errcode='22023'; end if;
  select * into s from public.request_sessions where id=p_session_id for update;
  if not found or s.joined_user_id<>auth.uid() then raise exception 'Request session not found' using errcode='P0002'; end if;
  if s.expires_at<=now() then update public.request_sessions set status='expired' where id=s.id; raise exception 'Request session expired' using errcode='P0001'; end if;
  if s.request_link_id is not null then
    select * into l from public.organization_request_links where id=s.request_link_id for update;
    if not found or l.revoked_at is not null or l.expires_at is not null and l.expires_at<=now() or l.used_at is not null then raise exception 'This request link expired or was revoked' using errcode='P0001'; end if;
  end if;
  if s.status<>'awaiting_consent' then raise exception 'Request has already been answered' using errcode='23505'; end if;
  if not p_approved then
    insert into public.request_responses(id,session_id,personal_user_id,status,declined_at) values(new_response_id,p_session_id,auth.uid(),'declined',now());
    update public.request_sessions set status='declined',consumed_at=now() where id=p_session_id;
    return jsonb_build_object('status','declined','responseId',new_response_id,'sharedFieldCount',0,'answerCount',0);
  end if;
  if p_approved_keys is null or cardinality(p_approved_keys)>20 or cardinality(p_approved_keys)<>(select count(distinct k) from unnest(p_approved_keys) k)
    or p_answers is null or jsonb_typeof(p_answers)<>'object' or p_missing_values is null or jsonb_typeof(p_missing_values)<>'object'
    or p_save_missing_keys is null or cardinality(p_save_missing_keys)>20 then raise exception 'Invalid request response' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_approved_keys) k where not exists(select 1 from public.request_session_fields sf where sf.session_id=p_session_id and sf.field_key=k)) then raise exception 'An unrequested field was selected' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(p_missing_values) e where not public.is_valid_field_key(e.key) or jsonb_typeof(e.value)<>'string' or char_length(e.value#>>'{}')>2000
    or not exists(select 1 from public.request_session_fields sf where sf.session_id=p_session_id and sf.field_key=e.key)) then raise exception 'Invalid missing Vault detail' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_save_missing_keys) k where not (p_missing_values ? k)) then raise exception 'Only newly entered details can be saved to your Vault' using errcode='22023'; end if;
  if cardinality(p_save_missing_keys)<>(select count(distinct k) from unnest(p_save_missing_keys) k) then raise exception 'Invalid Vault save selection' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(p_missing_values) e join public.personal_fields pf on pf.user_id=auth.uid() and pf.field_key=e.key where trim(pf.value)<>'') then raise exception 'An entered value is already in your Vault' using errcode='22023'; end if;
  select coalesce(array_agg(sf.field_key),'{}') into missing_keys from public.request_session_fields sf
    left join public.personal_fields pf on pf.user_id=auth.uid() and pf.field_key=sf.field_key
    where sf.session_id=p_session_id and sf.required and (coalesce(nullif(trim(pf.value),''),nullif(trim(p_missing_values->>sf.field_key),'')) is null or not(sf.field_key=any(p_approved_keys)));
  if cardinality(missing_keys)>0 then raise exception 'Required request details are missing' using errcode='23514',detail=array_to_string(missing_keys,','); end if;
  if exists(select 1 from unnest(p_approved_keys) k where not exists(select 1 from public.personal_fields pf where pf.user_id=auth.uid() and pf.field_key=k and trim(pf.value)<>'') and coalesce(trim(p_missing_values->>k),'')='') then raise exception 'Selected Vault details are missing' using errcode='23514'; end if;
  answer_count:=public.validate_request_answers(s.template_version_id,p_answers);
  if cardinality(p_save_missing_keys)>0 then
    insert into public.personal_fields(user_id,field_key,value)
      select auth.uid(),e.key,e.value#>>'{}' from jsonb_each(p_missing_values) e where e.key=any(p_save_missing_keys)
      on conflict(user_id,field_key) do update set value=excluded.value,updated_at=now();
  end if;
  insert into public.request_responses(id,session_id,personal_user_id,status,approved_at,delete_after,answers,answer_count)
    values(new_response_id,p_session_id,auth.uid(),'approved',now(),now()+make_interval(days=>s.retention_days),p_answers,answer_count);
  insert into public.shared_values(response_id,field_key,value_snapshot)
    select new_response_id,sf.field_key,coalesce(nullif(p_missing_values->>sf.field_key,''),pf.value)
    from public.request_session_fields sf left join public.personal_fields pf on pf.user_id=auth.uid() and pf.field_key=sf.field_key
    where sf.session_id=p_session_id and sf.field_key=any(p_approved_keys) and coalesce(nullif(p_missing_values->>sf.field_key,''),pf.value) is not null;
  get diagnostics shared_count=row_count;
  update public.request_responses set shared_field_count=shared_count where id=new_response_id;
  update public.request_sessions set status='approved',consumed_at=now() where id=p_session_id;
  if s.request_link_id is not null and l.one_time then update public.organization_request_links set used_at=now(),reserved_session_id=null where id=l.id; end if;
  return jsonb_build_object('status','approved','responseId',new_response_id,'sharedFieldCount',shared_count,'answerCount',answer_count,
    'shared',coalesce((select jsonb_object_agg(sv.field_key,sv.value_snapshot) from public.shared_values sv where sv.response_id=new_response_id),'{}'::jsonb));
end $$;
