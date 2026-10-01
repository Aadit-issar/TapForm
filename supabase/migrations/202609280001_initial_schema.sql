create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('personal', 'organization');
create type public.request_status as enum ('created', 'awaiting_consent', 'approved', 'declined', 'expired');
create type public.response_status as enum ('approved', 'declined');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'personal',
  display_name text not null default '' check (char_length(display_name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.personal_fields (
  user_id uuid not null references public.profiles(id) on delete cascade,
  field_key text not null check (field_key = any (array['full_name','preferred_name','date_of_birth','gender','nationality','phone','email','address','city','state','postal_code','country','institution','grade','student_id','course','emergency_name','emergency_relationship','emergency_phone','emergency_email'])),
  value text not null check (char_length(value) <= 2000), verified boolean not null default false,
  updated_at timestamptz not null default now(), primary key (user_id, field_key)
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120), organization_type text not null check (char_length(organization_type) between 2 and 60),
  contact_email text not null check (char_length(contact_email) <= 254),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified')), created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner','worker')), created_at timestamptz not null default now(), primary key (organization_id,user_id)
);
create table public.request_templates (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 100), purpose text not null check (char_length(purpose) between 2 and 240),
  retention_description text not null default '30 days', retention_days smallint not null default 30 check(retention_days in (7,30,90)),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,organization_id)
);
create table public.request_template_fields (
  template_id uuid not null references public.request_templates(id) on delete cascade,
  field_key text not null check (field_key = any (array['full_name','preferred_name','date_of_birth','gender','nationality','phone','email','address','city','state','postal_code','country','institution','grade','student_id','course','emergency_name','emergency_relationship','emergency_phone','emergency_email'])),
  required boolean not null default false, display_order smallint not null default 0 check (display_order between 0 and 99), primary key(template_id,field_key)
);
create table public.request_sessions (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null, created_by uuid not null references public.profiles(id) on delete restrict,
  status public.request_status not null default 'created', nonce_hash text not null check(nonce_hash ~ '^[0-9a-f]{64}$'),
  joined_user_id uuid references public.profiles(id) on delete set null, expires_at timestamptz not null, retention_days smallint not null check(retention_days in (7,30,90)), joined_at timestamptz, consumed_at timestamptz,
  created_at timestamptz not null default now(), foreign key(template_id,organization_id) references public.request_templates(id,organization_id) on delete cascade,
  check(expires_at <= created_at + interval '3 minutes')
);
create table public.request_session_fields (
  session_id uuid not null references public.request_sessions(id) on delete cascade,
  field_key text not null check (field_key = any (array['full_name','preferred_name','date_of_birth','gender','nationality','phone','email','address','city','state','postal_code','country','institution','grade','student_id','course','emergency_name','emergency_relationship','emergency_phone','emergency_email'])),
  required boolean not null, display_order smallint not null, primary key(session_id,field_key)
);
create table public.request_responses (
  id uuid primary key default gen_random_uuid(), session_id uuid not null unique references public.request_sessions(id) on delete cascade,
  personal_user_id uuid not null references public.profiles(id) on delete restrict, status public.response_status not null,
  approved_at timestamptz, declined_at timestamptz, delete_after timestamptz, created_at timestamptz not null default now(),
  check ((status='approved' and approved_at is not null and declined_at is null and delete_after is not null) or (status='declined' and declined_at is not null and approved_at is null and delete_after is null))
);
create table public.shared_values (
  response_id uuid not null references public.request_responses(id) on delete cascade,
  field_key text not null check (field_key = any (array['full_name','preferred_name','date_of_birth','gender','nationality','phone','email','address','city','state','postal_code','country','institution','grade','student_id','course','emergency_name','emergency_relationship','emergency_phone','emergency_email'])),
  value_snapshot text not null check (char_length(value_snapshot) <= 2000), created_at timestamptz not null default now(), primary key(response_id,field_key)
);
create index request_sessions_org_created_idx on public.request_sessions(organization_id,created_at desc);
create index request_sessions_expiry_idx on public.request_sessions(expires_at) where status in ('created','awaiting_consent');
create index request_responses_personal_idx on public.request_responses(personal_user_id,created_at desc);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$ select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid()) $$;
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'display_name','')) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_organization(p_name text,p_type text,p_contact_email text)
returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$ declare new_org_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if char_length(trim(p_name)) not between 2 and 120 or char_length(trim(p_type)) not between 2 and 60 or char_length(trim(p_contact_email)) > 254 then raise exception 'Invalid organization details' using errcode='22023'; end if;
  insert into public.organizations(owner_user_id,name,organization_type,contact_email) values(auth.uid(),trim(p_name),trim(p_type),trim(p_contact_email)) returning id into new_org_id;
  insert into public.organization_members(organization_id,user_id,member_role) values(new_org_id,auth.uid(),'owner');
  update public.profiles set role='organization',updated_at=now() where id=auth.uid();
  return new_org_id;
end $$;

create or replace function public.create_request_session(p_template_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare t public.request_templates%rowtype; new_session_id uuid:=gen_random_uuid(); raw_nonce text:=encode(extensions.gen_random_bytes(16),'hex'); expiry timestamptz:=now()+interval '2 minutes';
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into t from public.request_templates where id=p_template_id for share;
  if not found or not public.is_org_member(t.organization_id) then raise exception 'Template not found' using errcode='P0002'; end if;
  insert into public.request_sessions(id,organization_id,template_id,created_by,nonce_hash,expires_at,retention_days)
    values(new_session_id,t.organization_id,t.id,auth.uid(),encode(extensions.digest(raw_nonce,'sha256'),'hex'),expiry,t.retention_days);
  insert into public.request_session_fields(session_id,field_key,required,display_order)
    select new_session_id,field_key,required,display_order from public.request_template_fields where template_id=t.id;
  if not exists(select 1 from public.request_session_fields where session_id=new_session_id) then raise exception 'Template has no requested fields' using errcode='22023'; end if;
  return jsonb_build_object('version',1,'requestSessionId',new_session_id,'nonce',raw_nonce,'expiresAt',expiry,'organizationId',t.organization_id,
    'organizationName',(select name from public.organizations where id=t.organization_id),'purpose',t.purpose,'templateName',t.name,'retentionDescription',t.retention_description);
end $$;

create or replace function public.join_request_session(p_session_id uuid,p_nonce text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare s public.request_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_nonce is null or p_nonce !~ '^[0-9a-fA-F]{32}$' then raise exception 'Invalid session payload' using errcode='22023'; end if;
  select * into s from public.request_sessions where id=p_session_id for update;
  if not found then raise exception 'Request session not found' using errcode='P0002'; end if;
  if s.expires_at<=now() then update public.request_sessions set status='expired',nonce_hash=repeat('0',64) where id=s.id and status in ('created','awaiting_consent'); raise exception 'Request session expired' using errcode='P0001'; end if;
  if s.status<>'created' or s.nonce_hash<>encode(extensions.digest(lower(p_nonce),'sha256'),'hex') then raise exception 'Request session is invalid or already used' using errcode='23505'; end if;
  if s.created_by=auth.uid() then raise exception 'Request cannot be joined by its creator' using errcode='42501'; end if;
  update public.request_sessions set status='awaiting_consent',joined_user_id=auth.uid(),joined_at=now(),nonce_hash=repeat('0',64) where id=s.id;
  return (select jsonb_build_object('sessionId',rs.id,'organizationId',rs.organization_id,'organizationName',o.name,'organizationStatus',o.verification_status,'purpose',t.purpose,'templateName',t.name,'retentionDescription',t.retention_description,'expiresAt',rs.expires_at,
    'fields',coalesce((select jsonb_agg(jsonb_build_object('key',sf.field_key,'required',sf.required,'displayOrder',sf.display_order) order by sf.display_order) from public.request_session_fields sf where sf.session_id=rs.id),'[]'::jsonb))
    from public.request_sessions rs join public.organizations o on o.id=rs.organization_id join public.request_templates t on t.id=rs.template_id where rs.id=s.id);
end $$;

create or replace function public.respond_to_request(p_session_id uuid,p_approved boolean,p_approved_keys text[] default '{}')
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare s public.request_sessions%rowtype; new_response_id uuid:=gen_random_uuid(); missing_keys text[];
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into s from public.request_sessions where id=p_session_id for update;
  if not found or s.joined_user_id<>auth.uid() then raise exception 'Request session not found' using errcode='P0002'; end if;
  if s.expires_at<=now() then update public.request_sessions set status='expired' where id=s.id; raise exception 'Request session expired' using errcode='P0001'; end if;
  if s.status<>'awaiting_consent' then raise exception 'Request has already been answered' using errcode='23505'; end if;
  if not p_approved then
    insert into public.request_responses(id,session_id,personal_user_id,status,declined_at) values(new_response_id,p_session_id,auth.uid(),'declined',now());
    update public.request_sessions set status='declined',consumed_at=now() where id=p_session_id;
    return jsonb_build_object('status','declined','responseId',new_response_id);
  end if;
  if p_approved_keys is null or cardinality(p_approved_keys)>20 then raise exception 'Invalid field selection' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_approved_keys) k where not exists(select 1 from public.request_session_fields sf where sf.session_id=p_session_id and sf.field_key=k)) then raise exception 'An unrequested field was selected' using errcode='22023'; end if;
  select coalesce(array_agg(sf.field_key),'{}') into missing_keys from public.request_session_fields sf
    left join public.personal_fields pf on pf.user_id=auth.uid() and pf.field_key=sf.field_key
    where sf.session_id=p_session_id and sf.required and (pf.value is null or not(sf.field_key=any(p_approved_keys)));
  if cardinality(missing_keys)>0 then raise exception 'Required fields are missing' using errcode='23514',detail=array_to_string(missing_keys,','); end if;
  if exists(select 1 from unnest(p_approved_keys) k where not exists(select 1 from public.personal_fields pf where pf.user_id=auth.uid() and pf.field_key=k)) then raise exception 'Selected vault field is missing' using errcode='23514'; end if;
  insert into public.request_responses(id,session_id,personal_user_id,status,approved_at,delete_after)
    values(new_response_id,p_session_id,auth.uid(),'approved',now(),now()+make_interval(days=>s.retention_days));
  insert into public.shared_values(response_id,field_key,value_snapshot)
    select new_response_id,pf.field_key,pf.value from public.personal_fields pf where pf.user_id=auth.uid() and pf.field_key=any(p_approved_keys)
      and exists(select 1 from public.request_session_fields sf where sf.session_id=p_session_id and sf.field_key=pf.field_key);
  update public.request_sessions set status='approved',consumed_at=now() where id=p_session_id;
  return jsonb_build_object('status','approved','responseId',new_response_id,'shared',coalesce((select jsonb_object_agg(sv.field_key,sv.value_snapshot) from public.shared_values sv where sv.response_id=new_response_id),'{}'::jsonb));
end $$;

create or replace function public.purge_expired_shared_values()
returns integer language plpgsql security definer set search_path=public,pg_temp
as $$ declare removed integer;
begin
  delete from public.shared_values sv using public.request_responses r where r.id=sv.response_id and r.delete_after<=now();
  get diagnostics removed=row_count;
  return removed;
end $$;

alter table public.profiles enable row level security;
alter table public.personal_fields enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.request_templates enable row level security;
alter table public.request_template_fields enable row level security;
alter table public.request_sessions enable row level security;
alter table public.request_session_fields enable row level security;
alter table public.request_responses enable row level security;
alter table public.shared_values enable row level security;
grant usage on schema public to authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert,update,delete on public.personal_fields to authenticated;
grant select on public.organizations,public.organization_members,public.request_sessions,public.request_session_fields,public.request_responses,public.shared_values to authenticated;
grant select,insert,update,delete on public.request_templates,public.request_template_fields to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy fields_select_own on public.personal_fields for select to authenticated using(user_id=auth.uid());
create policy fields_insert_own on public.personal_fields for insert to authenticated with check(user_id=auth.uid());
create policy fields_update_own on public.personal_fields for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy fields_delete_own on public.personal_fields for delete to authenticated using(user_id=auth.uid());
create policy organizations_member_select on public.organizations for select to authenticated using(public.is_org_member(id));
create policy organizations_requester_select on public.organizations for select to authenticated using(exists(select 1 from public.request_sessions s where s.organization_id=id and s.joined_user_id=auth.uid()));
create policy organization_members_self_select on public.organization_members for select to authenticated using(user_id=auth.uid());
create policy templates_member_all on public.request_templates for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id) and created_by=auth.uid());
create policy templates_requester_select on public.request_templates for select to authenticated using(exists(select 1 from public.request_sessions s where s.template_id=id and s.joined_user_id=auth.uid()));
create policy template_fields_member_all on public.request_template_fields for all to authenticated using(exists(select 1 from public.request_templates t where t.id=template_id and public.is_org_member(t.organization_id))) with check(exists(select 1 from public.request_templates t where t.id=template_id and public.is_org_member(t.organization_id)));
create policy sessions_participant_select on public.request_sessions for select to authenticated using(public.is_org_member(organization_id) or joined_user_id=auth.uid());
create policy session_fields_org_select on public.request_session_fields for select to authenticated using(exists(select 1 from public.request_sessions s where s.id=session_id and public.is_org_member(s.organization_id)));
create policy responses_personal_or_org_select on public.request_responses for select to authenticated using(personal_user_id=auth.uid() or exists(select 1 from public.request_sessions s where s.id=session_id and public.is_org_member(s.organization_id)));
create policy shared_values_personal_or_org_select on public.shared_values for select to authenticated using(exists(select 1 from public.request_responses r where r.id=response_id and r.personal_user_id=auth.uid()) or exists(select 1 from public.request_responses r join public.request_sessions s on s.id=r.session_id where r.id=response_id and r.status='approved' and public.is_org_member(s.organization_id)));

revoke all on function public.is_org_member(uuid) from public; grant execute on function public.is_org_member(uuid) to authenticated;
revoke all on function public.create_organization(text,text,text) from public; grant execute on function public.create_organization(text,text,text) to authenticated;
revoke all on function public.create_request_session(uuid) from public; grant execute on function public.create_request_session(uuid) to authenticated;
revoke all on function public.join_request_session(uuid,text) from public; grant execute on function public.join_request_session(uuid,text) to authenticated;
revoke all on function public.respond_to_request(uuid,boolean,text[]) from public; grant execute on function public.respond_to_request(uuid,boolean,text[]) to authenticated;
revoke all on function public.purge_expired_shared_values() from public;
grant execute on function public.purge_expired_shared_values() to service_role;
do $$ begin alter publication supabase_realtime add table public.request_responses; exception when duplicate_object then null; end $$;
