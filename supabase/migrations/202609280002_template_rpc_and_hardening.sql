create or replace function public.save_request_template(
  p_template_id uuid,
  p_name text,
  p_purpose text,
  p_retention_days smallint,
  p_fields jsonb
) returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare template_org uuid; saved_id uuid; entry jsonb; idx integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 100
    or char_length(trim(coalesce(p_purpose,''))) not between 2 and 240
    or p_retention_days not in (7,30,90)
    or p_fields is null or jsonb_typeof(p_fields)<>'array' or jsonb_array_length(p_fields) not between 1 and 20 then
    raise exception 'Invalid template details' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_fields) e where
      jsonb_typeof(e)<>'object' or not (e ? 'key') or not (e ? 'required')
      or jsonb_typeof(e->'key')<>'string' or jsonb_typeof(e->'required')<>'boolean'
      or (e ? 'displayOrder' and jsonb_typeof(e->'displayOrder')<>'number')) then
    raise exception 'Invalid template field' using errcode='22023';
  end if;
  if (select count(distinct e->>'key') from jsonb_array_elements(p_fields) e)<>jsonb_array_length(p_fields) then
    raise exception 'Duplicate template fields are not allowed' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_fields) e where e->>'key' not in
    ('full_name','preferred_name','date_of_birth','gender','nationality','phone','email','address','city','state','postal_code','country','institution','grade','student_id','course','emergency_name','emergency_relationship','emergency_phone','emergency_email')) then
    raise exception 'Unknown template field' using errcode='22023';
  end if;
  if p_template_id is not null then
    select organization_id into template_org from public.request_templates where id=p_template_id for update;
    if not found or not public.is_org_member(template_org) then raise exception 'Template not found' using errcode='P0002'; end if;
    update public.request_templates set name=trim(p_name),purpose=trim(p_purpose),retention_days=p_retention_days,
      retention_description=p_retention_days::text||' days',updated_at=now() where id=p_template_id;
    saved_id:=p_template_id;
    delete from public.request_template_fields where template_id=saved_id;
  else
    select m.organization_id into template_org from public.organization_members m where m.user_id=auth.uid() order by m.created_at limit 1;
    if template_org is null then raise exception 'Organization not found' using errcode='P0002'; end if;
    insert into public.request_templates(organization_id,created_by,name,purpose,retention_days,retention_description)
      values(template_org,auth.uid(),trim(p_name),trim(p_purpose),p_retention_days,p_retention_days::text||' days') returning id into saved_id;
  end if;
  for entry in select value from jsonb_array_elements(p_fields) loop
    idx:=idx+1;
    insert into public.request_template_fields(template_id,field_key,required,display_order)
      values(saved_id,entry->>'key',(entry->>'required')::boolean,idx);
  end loop;
  return saved_id;
end $$;
revoke all on function public.save_request_template(uuid,text,text,smallint,jsonb) from public;
grant execute on function public.save_request_template(uuid,text,text,smallint,jsonb) to authenticated;

create or replace function public.respond_to_request(p_session_id uuid,p_approved boolean,p_approved_keys text[] default '{}')
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare s public.request_sessions%rowtype; new_response_id uuid:=gen_random_uuid(); missing_keys text[];
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into s from public.request_sessions where id=p_session_id for update;
  if not found or s.joined_user_id<>auth.uid() then raise exception 'Request session not found' using errcode='P0002'; end if;
  if s.expires_at<=now() then raise exception 'Request session expired' using errcode='P0001'; end if;
  if s.status<>'awaiting_consent' then raise exception 'Request has already been answered' using errcode='23505'; end if;
  if not p_approved then
    insert into public.request_responses(id,session_id,personal_user_id,status,declined_at) values(new_response_id,p_session_id,auth.uid(),'declined',now());
    update public.request_sessions set status='declined',consumed_at=now() where id=p_session_id;
    return jsonb_build_object('status','declined','responseId',new_response_id);
  end if;
  if p_approved_keys is null or cardinality(p_approved_keys)>20
    or cardinality(p_approved_keys)<>(select count(distinct k) from unnest(p_approved_keys) k) then
    raise exception 'Invalid field selection' using errcode='22023';
  end if;
  if exists(select 1 from unnest(p_approved_keys) k where not exists(select 1 from public.request_session_fields sf where sf.session_id=p_session_id and sf.field_key=k)) then raise exception 'An unrequested field was selected' using errcode='22023'; end if;
  select coalesce(array_agg(sf.field_key),'{}') into missing_keys from public.request_session_fields sf
    left join public.personal_fields pf on pf.user_id=auth.uid() and pf.field_key=sf.field_key
    where sf.session_id=p_session_id and sf.required and (pf.value is null or not(sf.field_key=any(p_approved_keys)));
  if cardinality(missing_keys)>0 then raise exception 'Required fields are missing' using errcode='23514',detail=array_to_string(missing_keys,','); end if;
  if exists(select 1 from unnest(p_approved_keys) k where not exists(select 1 from public.personal_fields pf where pf.user_id=auth.uid() and pf.field_key=k)) then raise exception 'Selected vault field is missing' using errcode='23514'; end if;
  insert into public.request_responses(id,session_id,personal_user_id,status,approved_at,delete_after) values(new_response_id,p_session_id,auth.uid(),'approved',now(),now()+make_interval(days=>s.retention_days));
  insert into public.shared_values(response_id,field_key,value_snapshot) select new_response_id,pf.field_key,pf.value from public.personal_fields pf where pf.user_id=auth.uid() and pf.field_key=any(p_approved_keys) and exists(select 1 from public.request_session_fields sf where sf.session_id=p_session_id and sf.field_key=pf.field_key);
  update public.request_sessions set status='approved',consumed_at=now() where id=p_session_id;
  return jsonb_build_object('status','approved','responseId',new_response_id,'shared',coalesce((select jsonb_object_agg(sv.field_key,sv.value_snapshot) from public.shared_values sv where sv.response_id=new_response_id),'{}'::jsonb));
end $$;
revoke all on function public.respond_to_request(uuid,boolean,text[]) from public;
grant execute on function public.respond_to_request(uuid,boolean,text[]) to authenticated;

-- Client profile edits may change a display name but never a role claim.
create or replace function public.protect_profile_role()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.role is distinct from old.role and current_user not in ('postgres','service_role') then
    raise exception 'Profile role is server managed' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update of role on public.profiles for each row execute function public.protect_profile_role();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare requested_role public.app_role;
begin
  requested_role := case when new.raw_user_meta_data->>'role'='organization' then 'organization'::public.app_role else 'personal'::public.app_role end;
  insert into public.profiles(id,role,display_name)
    values(new.id,requested_role,coalesce(new.raw_user_meta_data->>'display_name',''))
    on conflict (id) do nothing;
  return new;
end $$;
