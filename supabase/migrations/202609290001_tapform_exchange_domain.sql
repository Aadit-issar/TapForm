-- Persistent sharing domain. Existing request sessions and snapshots remain
-- valid; new versions and links are additive and keep active requests stable.

do $$ begin
  create type public.tapform_question_type as enum
    ('short_text','long_text','single_choice','multiple_choice','yes_no','number','date');
exception when duplicate_object then null; end $$;

create or replace function public.is_valid_field_key(p_key text)
returns boolean language sql immutable parallel safe
as $$ select p_key = any (array[
  'full_name','preferred_name','date_of_birth','gender','nationality','phone','email',
  'address','city','state','postal_code','country','institution','grade','student_id',
  'course','emergency_name','emergency_relationship','emergency_phone','emergency_email'
]) $$;

create or replace function public.jsonb_object_key_count(p_value jsonb)
returns integer language sql immutable parallel safe
as $$ select count(*)::integer from jsonb_object_keys(p_value) $$;

alter table public.profiles add column if not exists default_tap_card_id uuid;

create table if not exists public.tap_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  category text not null default 'custom' check (category in ('personal','work','school','networking','emergency','sports','custom')),
  expires_at timestamptz,
  archived_at timestamptz,
  display_order smallint not null default 0 check (display_order between 0 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,user_id)
);
create index if not exists tap_cards_owner_idx on public.tap_cards(user_id,display_order,created_at desc);
create index if not exists tap_cards_expiry_idx on public.tap_cards(expires_at) where archived_at is null and expires_at is not null;

create table if not exists public.tap_card_fields (
  card_id uuid not null,
  user_id uuid not null,
  field_key text not null check (public.is_valid_field_key(field_key)),
  display_order smallint not null default 0 check (display_order between 0 and 99),
  primary key (card_id,field_key),
  foreign key (card_id,user_id) references public.tap_cards(id,user_id) on delete cascade
);
alter table public.request_sessions drop constraint if exists request_sessions_check;
alter table public.request_sessions drop constraint if exists request_sessions_lifetime_check;
alter table public.request_sessions add constraint request_sessions_lifetime_check check (expires_at <= created_at + interval '20 minutes');

alter table public.request_templates alter column created_by drop not null;
alter table public.request_templates drop constraint if exists request_templates_created_by_fkey;
alter table public.request_templates add constraint request_templates_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.request_sessions alter column created_by drop not null;
alter table public.request_sessions drop constraint if exists request_sessions_created_by_fkey;
alter table public.request_sessions add constraint request_sessions_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

do $$ begin
  alter table public.profiles add constraint profiles_default_tap_card_fk
    foreign key (default_tap_card_id) references public.tap_cards(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.organization_preferences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  default_template_id uuid,
  updated_at timestamptz not null default now()
);

alter table public.request_templates add column if not exists description text not null default '';
alter table public.request_templates add column if not exists is_archived boolean not null default false;

create table if not exists public.request_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.request_templates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revision integer not null check (revision > 0),
  name text not null check (char_length(name) between 2 and 100),
  description text not null default '' check (char_length(description) <= 500),
  purpose text not null check (char_length(purpose) between 2 and 240),
  retention_description text not null,
  retention_days smallint not null check (retention_days in (7,30,90)),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id,revision),
  unique (id,organization_id)
);
create index if not exists template_versions_org_idx on public.request_template_versions(organization_id,template_id,revision desc);

create table if not exists public.request_template_version_fields (
  version_id uuid not null references public.request_template_versions(id) on delete cascade,
  field_key text not null check (public.is_valid_field_key(field_key)),
  required boolean not null default false,
  display_order smallint not null default 0 check (display_order between 0 and 99),
  primary key (version_id,field_key)
);

create table if not exists public.request_template_version_questions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.request_template_versions(id) on delete cascade,
  prompt text not null check (char_length(trim(prompt)) between 1 and 240),
  question_type public.tapform_question_type not null,
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 30),
  min_length smallint not null default 0 check (min_length between 0 and 4000),
  max_length smallint not null default 500 check (max_length between 1 and 4000),
  min_value numeric,
  max_value numeric,
  display_order smallint not null default 0 check (display_order between 0 and 99),
  check (min_length <= max_length),
  check (min_value is null or max_value is null or min_value <= max_value),
  check (question_type not in ('single_choice','multiple_choice') or jsonb_array_length(options) between 1 and 30),
  check (question_type in ('single_choice','multiple_choice') or jsonb_array_length(options) = 0),
  unique (version_id,display_order)
);
create index if not exists template_questions_version_idx on public.request_template_version_questions(version_id,display_order);

-- Snapshot the currently deployed templates before adding the version FK.
insert into public.request_template_versions(template_id,organization_id,revision,name,description,purpose,retention_description,retention_days,created_by)
select t.id,t.organization_id,1,t.name,t.description,t.purpose,t.retention_description,t.retention_days,t.created_by
from public.request_templates t
where not exists (select 1 from public.request_template_versions v where v.template_id=t.id);
insert into public.request_template_version_fields(version_id,field_key,required,display_order)
select v.id,f.field_key,f.required,f.display_order
from public.request_template_versions v
join public.request_template_fields f on f.template_id=v.template_id
where v.revision=1 and not exists (select 1 from public.request_template_version_fields vf where vf.version_id=v.id);

alter table public.organization_preferences drop constraint if exists organization_preferences_default_template_fk;
do $$ begin
  alter table public.organization_preferences add constraint organization_preferences_default_template_fk
    foreign key (default_template_id,organization_id)
    references public.request_templates(id,organization_id) on delete cascade;
exception when duplicate_object then null; end $$;

alter table public.request_sessions add column if not exists template_version_id uuid;
alter table public.request_sessions add column if not exists request_link_id uuid;
update public.request_sessions s set template_version_id = (
  select v.id from public.request_template_versions v where v.template_id=s.template_id order by v.revision desc limit 1
) where s.template_version_id is null;
alter table public.request_sessions alter column template_version_id set not null;
alter table public.request_sessions drop constraint if exists request_sessions_template_version_id_fkey;
alter table public.request_sessions add constraint request_sessions_template_version_id_fkey
  foreign key (template_version_id) references public.request_template_versions(id) on delete cascade;
alter table public.request_sessions drop constraint if exists request_sessions_template_id_organization_id_fkey;
alter table public.request_sessions add constraint request_sessions_template_id_organization_id_fkey
  foreign key (template_id,organization_id) references public.request_templates(id,organization_id) on delete cascade;
create index if not exists request_sessions_template_version_idx on public.request_sessions(template_version_id,created_at desc);
create index if not exists request_sessions_user_state_idx on public.request_sessions(joined_user_id,status,created_at desc);

alter table public.request_responses add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.request_responses add column if not exists answer_count smallint not null default 0 check (answer_count between 0 and 50);
alter table public.request_responses add column if not exists shared_field_count smallint not null default 0 check (shared_field_count between 0 and 20);
alter table public.request_responses drop constraint if exists request_responses_personal_user_id_fkey;
alter table public.request_responses add constraint request_responses_personal_user_id_fkey
  foreign key (personal_user_id) references public.profiles(id) on delete cascade;
create index if not exists request_responses_status_created_idx on public.request_responses(status,created_at desc);

create table if not exists public.organization_request_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null,
  template_version_id uuid not null references public.request_template_versions(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  token text not null check (token ~ '^[0-9a-f]{64}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  one_time boolean not null default false,
  expires_at timestamptz,
  revoked_at timestamptz,
  used_at timestamptz,
  reserved_session_id uuid,
  created_at timestamptz not null default now(),
  foreign key (template_id,organization_id) references public.request_templates(id,organization_id) on delete cascade,
  foreign key (template_version_id,organization_id) references public.request_template_versions(id,organization_id) on delete cascade,
  check (expires_at is null or expires_at > created_at)
);
create index if not exists organization_links_org_idx on public.organization_request_links(organization_id,created_at desc);
create index if not exists organization_links_expiry_idx on public.organization_request_links(expires_at) where revoked_at is null and expires_at is not null;
alter table public.organization_request_links add column if not exists submission_count integer not null default 0 check (submission_count >= 0);
alter table public.request_sessions drop constraint if exists request_sessions_request_link_id_fkey;
alter table public.request_sessions add constraint request_sessions_request_link_id_fkey foreign key (request_link_id) references public.organization_request_links(id) on delete set null;
alter table public.organization_request_links drop constraint if exists organization_request_links_reserved_session_id_fkey;
alter table public.organization_request_links add constraint organization_request_links_reserved_session_id_fkey foreign key (reserved_session_id) references public.request_sessions(id) on delete set null;
create index if not exists request_sessions_link_idx on public.request_sessions(request_link_id,created_at desc) where request_link_id is not null;

create or replace function public.sync_request_link_submission_count()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ declare target_session uuid; target_link uuid;
begin
  target_session:=case when tg_op='DELETE' then old.session_id else new.session_id end;
  select request_link_id into target_link from public.request_sessions where id=target_session;
  if target_link is not null then
    update public.organization_request_links l set submission_count=(select count(*)::integer from public.request_sessions s join public.request_responses r on r.session_id=s.id where s.request_link_id=target_link and r.status='approved') where l.id=target_link;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists request_link_submission_count_sync on public.request_responses;
create trigger request_link_submission_count_sync after insert or update of status or delete on public.request_responses
for each row execute function public.sync_request_link_submission_count();

create table if not exists public.peer_share_links (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.tap_cards(id) on delete set null,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  card_name_snapshot text not null,
  token text not null check (token ~ '^[0-9a-f]{64}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  one_time boolean not null default true,
  target_user_id uuid references public.profiles(id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  used_at timestamptz,
  reserved_exchange_id uuid,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at),
  check (target_user_id is null or target_user_id <> owner_user_id)
);
create index if not exists peer_share_links_owner_idx on public.peer_share_links(owner_user_id,created_at desc);

create table if not exists public.peer_exchange_sessions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.peer_share_links(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  receiver_user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key uuid not null,
  nonce_hash text not null check (nonce_hash ~ '^[0-9a-f]{64}$'),
  field_keys_snapshot text[] not null default '{}'::text[],
  status text not null default 'pending' check (status in ('pending','completed','declined','expired','revoked')),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (link_id,idempotency_key),
  check (sender_user_id <> receiver_user_id)
);
create index if not exists peer_exchange_inbox_idx on public.peer_exchange_sessions(receiver_user_id,status,created_at desc);
create index if not exists peer_exchange_sender_idx on public.peer_exchange_sessions(sender_user_id,created_at desc);

alter table public.peer_exchange_sessions add column if not exists field_keys_snapshot text[] not null default '{}'::text[];
update public.peer_exchange_sessions e set field_keys_snapshot=coalesce((
  select array_agg(f.field_key order by f.display_order) from public.peer_share_links l
  join public.tap_card_fields f on f.card_id=l.card_id and f.user_id=l.owner_user_id where l.id=e.link_id
),'{}'::text[]) where cardinality(e.field_keys_snapshot)=0;
alter table public.peer_exchange_sessions drop constraint if exists peer_exchange_fields_snapshot_count_check;
alter table public.peer_exchange_sessions add constraint peer_exchange_fields_snapshot_count_check check (cardinality(field_keys_snapshot) between 0 and 20);

create table if not exists public.peer_transfers (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null unique references public.peer_exchange_sessions(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  receiver_user_id uuid not null references public.profiles(id) on delete cascade,
  card_name_snapshot text not null,
  sender_name_snapshot text not null,
  values_snapshot jsonb not null check (jsonb_typeof(values_snapshot) = 'object' and public.jsonb_object_key_count(values_snapshot) between 1 and 20),
  field_count smallint not null check (field_count between 1 and 20),
  completed_at timestamptz not null default now(),
  check (sender_user_id <> receiver_user_id)
);
create index if not exists peer_transfers_sender_idx on public.peer_transfers(sender_user_id,completed_at desc);
create index if not exists peer_transfers_receiver_idx on public.peer_transfers(receiver_user_id,completed_at desc);

create table if not exists public.received_cards (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null unique references public.peer_transfers(id) on delete cascade,
  receiver_user_id uuid not null references public.profiles(id) on delete cascade,
  saved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists received_cards_inbox_idx on public.received_cards(receiver_user_id,archived_at,created_at desc);

create or replace function public.prevent_template_version_mutation()
returns trigger language plpgsql set search_path=public,pg_temp
as $$ begin raise exception 'Request template versions are immutable' using errcode='42501'; end $$;
drop trigger if exists request_template_versions_immutable on public.request_template_versions;
create trigger request_template_versions_immutable before update on public.request_template_versions
for each row execute function public.prevent_template_version_mutation();
drop trigger if exists request_template_version_fields_immutable on public.request_template_version_fields;
create trigger request_template_version_fields_immutable before update on public.request_template_version_fields
for each row execute function public.prevent_template_version_mutation();
drop trigger if exists request_template_version_questions_immutable on public.request_template_version_questions;
create trigger request_template_version_questions_immutable before update on public.request_template_version_questions
for each row execute function public.prevent_template_version_mutation();

create or replace function public.protect_default_tap_card()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  if new.default_tap_card_id is not null and not exists (
    select 1 from public.tap_cards c where c.id=new.default_tap_card_id and c.user_id=new.id
      and c.archived_at is null and (c.expires_at is null or c.expires_at>now())
  ) then raise exception 'Default Tap Card is unavailable' using errcode='23514'; end if;
  return new;
end $$;
drop trigger if exists protect_default_tap_card on public.profiles;
create trigger protect_default_tap_card before insert or update of default_tap_card_id on public.profiles
for each row execute function public.protect_default_tap_card();

create or replace function public.save_tap_card(
  p_card_id uuid,p_name text,p_category text,p_field_keys text[],p_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$ declare saved_id uuid; item text; idx integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 1 and 60 or p_category not in ('personal','work','school','networking','emergency','sports','custom')
    or p_field_keys is null or cardinality(p_field_keys) not between 1 and 20
    or cardinality(p_field_keys)<>(select count(distinct k) from unnest(p_field_keys) k)
    or exists(select 1 from unnest(p_field_keys) k where not public.is_valid_field_key(k))
    or p_expires_at is not null and p_expires_at<=now() then
    raise exception 'Invalid Tap Card details' using errcode='22023';
  end if;
  if p_card_id is not null then
    update public.tap_cards set name=trim(p_name),category=p_category,expires_at=p_expires_at,archived_at=null,updated_at=now()
      where id=p_card_id and user_id=auth.uid() returning id into saved_id;
    if saved_id is null then raise exception 'Tap Card not found' using errcode='P0002'; end if;
    delete from public.tap_card_fields where card_id=saved_id and user_id=auth.uid();
  else
    insert into public.tap_cards(user_id,name,category,expires_at) values(auth.uid(),trim(p_name),p_category,p_expires_at) returning id into saved_id;
  end if;
  foreach item in array p_field_keys loop
    insert into public.tap_card_fields(card_id,user_id,field_key,display_order) values(saved_id,auth.uid(),item,idx);
    idx:=idx+1;
  end loop;
  return saved_id;
end $$;

create or replace function public.set_default_tap_card(p_card_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$ begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_card_id is not null and not exists(select 1 from public.tap_cards c where c.id=p_card_id and c.user_id=auth.uid() and c.archived_at is null and (c.expires_at is null or c.expires_at>now())) then
    raise exception 'Tap Card not found or expired' using errcode='P0002';
  end if;
  update public.profiles set default_tap_card_id=p_card_id,updated_at=now() where id=auth.uid();
end $$;

create or replace function public.delete_tap_card(p_card_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$ declare removed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  update public.profiles set default_tap_card_id=null,updated_at=now() where id=auth.uid() and default_tap_card_id=p_card_id;
  update public.peer_share_links set revoked_at=coalesce(revoked_at,now()),card_id=null where card_id=p_card_id and owner_user_id=auth.uid();
  delete from public.tap_cards where id=p_card_id and user_id=auth.uid();
  get diagnostics removed=row_count;
  return removed=1;
end $$;

create or replace function public.reorder_tap_cards(p_card_ids uuid[])
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$ declare card_id uuid; order_no integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_card_ids is null or cardinality(p_card_ids)>100 or cardinality(p_card_ids)<>(select count(distinct id) from unnest(p_card_ids) id)
    or exists(select 1 from unnest(p_card_ids) id where not exists(select 1 from public.tap_cards c where c.id=id and c.user_id=auth.uid())) then
    raise exception 'Invalid Tap Card order' using errcode='22023';
  end if;
  foreach card_id in array p_card_ids loop
    update public.tap_cards set display_order=order_no,updated_at=now() where id=card_id and user_id=auth.uid();
    order_no:=order_no+1;
  end loop;
  return true;
end $$;

create or replace function public.create_card_share_link(
  p_card_id uuid,p_one_time boolean default true,p_expires_at timestamptz default null,p_share_back_transfer_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare c public.tap_cards%rowtype; new_link uuid:=gen_random_uuid(); raw_token text:=encode(extensions.gen_random_bytes(32),'hex'); target uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into c from public.tap_cards where id=p_card_id and user_id=auth.uid() for share;
  if not found or c.archived_at is not null or c.expires_at is not null and c.expires_at<=now() then raise exception 'Tap Card not found or expired' using errcode='P0002'; end if;
  if not exists(select 1 from public.tap_card_fields where card_id=c.id and user_id=auth.uid()) then raise exception 'Tap Card has no shareable fields' using errcode='22023'; end if;
  if exists(select 1 from public.tap_card_fields f left join public.personal_fields v on v.user_id=f.user_id and v.field_key=f.field_key where f.card_id=c.id and f.user_id=auth.uid() and coalesce(trim(v.value),'')='') then
    raise exception 'Add or remove missing Vault details before sharing this Tap Card' using errcode='23514';
  end if;
  if p_share_back_transfer_id is not null then
    select t.sender_user_id into target from public.peer_transfers t
      join public.received_cards r on r.transfer_id=t.id and r.receiver_user_id=auth.uid()
      where t.id=p_share_back_transfer_id;
    if target is null then raise exception 'Received card not found' using errcode='P0002'; end if;
    p_one_time:=true;
    if p_expires_at is null then p_expires_at:=now()+interval '15 minutes'; end if;
  end if;
  if p_one_time and p_expires_at is null then p_expires_at:=now()+interval '15 minutes'; end if;
  if p_expires_at is not null and p_expires_at<=now() then raise exception 'Share link expiry must be in the future' using errcode='22023'; end if;
  if c.expires_at is not null and (p_expires_at is null or p_expires_at>c.expires_at) then p_expires_at:=c.expires_at; end if;
  insert into public.peer_share_links(id,card_id,owner_user_id,card_name_snapshot,token,token_hash,one_time,target_user_id,expires_at)
    values(new_link,c.id,auth.uid(),c.name,raw_token,encode(extensions.digest(raw_token,'sha256'),'hex'),coalesce(p_one_time,true),target,p_expires_at);
  return jsonb_build_object('linkId',new_link,'token',raw_token,'cardName',c.name,'oneTime',coalesce(p_one_time,true),'expiresAt',p_expires_at);
end $$;

create or replace function public.revoke_card_share_link(p_link_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$ declare changed integer;
begin
  update public.peer_share_links set revoked_at=now() where id=p_link_id and owner_user_id=auth.uid() and revoked_at is null;
  get diagnostics changed=row_count;
  return changed=1;
end $$;

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
    insert into public.peer_exchange_sessions(id,link_id,sender_user_id,receiver_user_id,idempotency_key,nonce_hash,field_keys_snapshot,expires_at)
      values(new_id,l.id,l.owner_user_id,auth.uid(),p_idempotency_key,encode(extensions.digest(raw_nonce,'sha256'),'hex'),field_keys,least(coalesce(l.expires_at,now_at+interval '10 minutes'),now_at+interval '10 minutes')) returning * into e;
    if l.one_time then update public.peer_share_links set reserved_exchange_id=e.id where id=l.id; end if;
  end if;
  return jsonb_build_object('exchangeId',e.id,'nonce',raw_nonce,'expiresAt',e.expires_at,'senderName',coalesce((select display_name from public.profiles where id=l.owner_user_id),''),
    'cardName',l.card_name_snapshot,'fields',coalesce((select jsonb_agg(jsonb_build_object('key',f.field_key,'displayOrder',f.ordinality-1) order by f.ordinality)
      from unnest(e.field_keys_snapshot) with ordinality as f(field_key,ordinality)),'[]'::jsonb));
end $$;

create or replace function public.respond_to_peer_exchange(p_exchange_id uuid,p_nonce text,p_accept boolean)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare e public.peer_exchange_sessions%rowtype; l public.peer_share_links%rowtype; c public.tap_cards%rowtype; transfer_id uuid:=gen_random_uuid(); snapshots jsonb; sender_name text; field_total integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
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

create or replace function public.save_received_card(p_received_card_id uuid,p_saved boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$ declare changed integer;
begin
  update public.received_cards set saved_at=case when p_saved then coalesce(saved_at,now()) else null end,archived_at=null
    where id=p_received_card_id and receiver_user_id=auth.uid();
  get diagnostics changed=row_count;
  return changed=1;
end $$;

create or replace function public.purge_expired_shared_values()
returns integer language plpgsql security definer set search_path=public,pg_temp
as $$ declare removed integer;
begin
  delete from public.shared_values sv using public.request_responses r where r.id=sv.response_id and r.delete_after<=now();
  get diagnostics removed=row_count;
  -- Preserve non-sensitive receipt counts while removing retained response content.
  update public.request_responses set answers='{}'::jsonb where status='approved' and delete_after<=now() and answers<>'{}'::jsonb;
  update public.request_sessions set status='expired',nonce_hash=repeat('0',64),consumed_at=coalesce(consumed_at,now())
    where status in ('created','awaiting_consent') and expires_at<=now();
  update public.organization_request_links l set reserved_session_id=null
    where l.reserved_session_id is not null and not exists(
      select 1 from public.request_sessions s where s.id=l.reserved_session_id and s.status in ('created','awaiting_consent') and s.expires_at>now());
  update public.peer_exchange_sessions set status='expired'
    where status='pending' and expires_at<=now();
  update public.peer_share_links l set reserved_exchange_id=null
    where l.reserved_exchange_id is not null and not exists(
      select 1 from public.peer_exchange_sessions e where e.id=l.reserved_exchange_id and e.status='pending' and e.expires_at>now());
  return removed;
end $$;

create or replace function public.archive_received_card(p_received_card_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$ declare changed integer;
begin
  update public.received_cards set archived_at=now() where id=p_received_card_id and receiver_user_id=auth.uid() and archived_at is null;
  get diagnostics changed=row_count;
  return changed=1;
end $$;

create or replace function public.archive_request_template(p_template_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$ declare changed integer; template_org uuid;
begin
  select organization_id into template_org from public.request_templates where id=p_template_id;
  if template_org is null or not public.is_org_member(template_org) then raise exception 'Template not found' using errcode='P0002'; end if;
  update public.request_templates set is_archived=true,updated_at=now() where id=p_template_id and not is_archived;
  get diagnostics changed=row_count;
  update public.organization_preferences set default_template_id=null,updated_at=now() where organization_id=template_org and default_template_id=p_template_id;
  update public.organization_request_links set revoked_at=coalesce(revoked_at,now()) where template_id=p_template_id and revoked_at is null;
  return changed=1;
end $$;

drop function if exists public.save_request_template(uuid,text,text,smallint,jsonb);
create or replace function public.save_request_template(
  p_template_id uuid,p_name text,p_purpose text,p_retention_days smallint,p_fields jsonb,p_questions jsonb default '[]'::jsonb,p_description text default ''
) returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$ declare template_org uuid; saved_id uuid; version_id uuid; revision_no integer; entry jsonb; q jsonb; idx integer:=0; question_idx integer:=0; q_type public.tapform_question_type;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 100 or char_length(trim(coalesce(p_purpose,''))) not between 2 and 240
    or char_length(coalesce(p_description,''))>500 or p_retention_days not in (7,30,90)
    or p_fields is null or jsonb_typeof(p_fields)<>'array' or jsonb_array_length(p_fields) not between 1 and 20
    or p_questions is null or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)>50 then
    raise exception 'Invalid request template details' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_fields) e where jsonb_typeof(e)<>'object' or jsonb_typeof(e->'key')<>'string' or jsonb_typeof(e->'required')<>'boolean')
    or (select count(distinct e->>'key') from jsonb_array_elements(p_fields) e)<>jsonb_array_length(p_fields)
    or exists(select 1 from jsonb_array_elements(p_fields) e where not public.is_valid_field_key(e->>'key')) then
    raise exception 'Invalid or duplicate requested field' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_questions) e where jsonb_typeof(e)<>'object' or jsonb_typeof(e->'prompt')<>'string' or jsonb_typeof(e->'type')<>'string' or jsonb_typeof(e->'required')<>'boolean') then
    raise exception 'Invalid question definition' using errcode='22023';
  end if;
  if p_template_id is null then
    select m.organization_id into template_org from public.organization_members m where m.user_id=auth.uid() order by m.created_at limit 1;
    if template_org is null then raise exception 'Organization not found' using errcode='P0002'; end if;
    insert into public.request_templates(organization_id,created_by,name,purpose,description,retention_days,retention_description)
      values(template_org,auth.uid(),trim(p_name),trim(p_purpose),coalesce(p_description,''),p_retention_days,p_retention_days::text||' days') returning id into saved_id;
  else
    select organization_id into template_org from public.request_templates where id=p_template_id and not is_archived for update;
    if not found or not public.is_org_member(template_org) then raise exception 'Template not found' using errcode='P0002'; end if;
    saved_id:=p_template_id;
    update public.request_templates set name=trim(p_name),purpose=trim(p_purpose),description=coalesce(p_description,''),retention_days=p_retention_days,
      retention_description=p_retention_days::text||' days',updated_at=now() where id=saved_id;
    delete from public.request_template_fields where template_id=saved_id;
  end if;
  for entry in select value from jsonb_array_elements(p_fields) loop
    idx:=idx+1;
    insert into public.request_template_fields(template_id,field_key,required,display_order) values(saved_id,entry->>'key',(entry->>'required')::boolean,idx);
  end loop;
  select coalesce(max(revision),0)+1 into revision_no from public.request_template_versions where template_id=saved_id;
  insert into public.request_template_versions(template_id,organization_id,revision,name,description,purpose,retention_description,retention_days,created_by)
    values(saved_id,template_org,revision_no,trim(p_name),coalesce(p_description,''),trim(p_purpose),p_retention_days::text||' days',p_retention_days,auth.uid()) returning id into version_id;
  idx:=0;
  for entry in select value from jsonb_array_elements(p_fields) loop
    idx:=idx+1;
    insert into public.request_template_version_fields(version_id,field_key,required,display_order) values(version_id,entry->>'key',(entry->>'required')::boolean,idx);
  end loop;
  for q in select value from jsonb_array_elements(p_questions) loop
    question_idx:=question_idx+1;
    begin q_type:=(q->>'type')::public.tapform_question_type;
    exception when invalid_text_representation then raise exception 'Unsupported question type' using errcode='22023'; end;
    if char_length(trim(q->>'prompt')) not between 1 and 240 then raise exception 'Question prompt must be 1 to 240 characters' using errcode='22023'; end if;
    if q_type in ('single_choice','multiple_choice') and (jsonb_typeof(coalesce(q->'options','[]'::jsonb))<>'array' or jsonb_array_length(q->'options') not between 1 and 30
       or exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o)<>'string' or char_length(trim(o#>>'{}')) not between 1 and 120)
       or (select count(distinct o#>>'{}') from jsonb_array_elements(q->'options') o)<>jsonb_array_length(q->'options')) then
      raise exception 'Choice questions need 1 to 30 unique options' using errcode='22023';
    end if;
    insert into public.request_template_version_questions(version_id,prompt,question_type,required,options,min_length,max_length,min_value,max_value,display_order)
      values(version_id,trim(q->>'prompt'),q_type,(q->>'required')::boolean,
        case when q_type in ('single_choice','multiple_choice') then q->'options' else '[]'::jsonb end,
        coalesce((q->>'minLength')::smallint,0),coalesce((q->>'maxLength')::smallint,case when q_type='long_text' then 4000 else 500 end),
        (q->>'minValue')::numeric,(q->>'maxValue')::numeric,question_idx);
  end loop;
  return saved_id;
end $$;

create or replace function public.set_default_request_template(p_template_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp
as $$ declare org_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_template_id is null then
    select organization_id into org_id from public.organization_members where user_id=auth.uid() order by created_at limit 1;
    if org_id is not null then insert into public.organization_preferences(organization_id,default_template_id) values(org_id,null)
      on conflict(organization_id) do update set default_template_id=null,updated_at=now(); end if;
    return;
  end if;
  select organization_id into org_id from public.request_templates where id=p_template_id and not is_archived;
  if not found or not public.is_org_member(org_id) then raise exception 'Template not found' using errcode='P0002'; end if;
  insert into public.organization_preferences(organization_id,default_template_id) values(org_id,p_template_id)
    on conflict(organization_id) do update set default_template_id=excluded.default_template_id,updated_at=now();
end $$;

create or replace function public.create_request_link(p_template_id uuid,p_one_time boolean default false,p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare t public.request_templates%rowtype; v public.request_template_versions%rowtype; link_id uuid:=gen_random_uuid(); raw_token text:=encode(extensions.gen_random_bytes(32),'hex');
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into t from public.request_templates where id=p_template_id and not is_archived;
  if not found or not public.is_org_member(t.organization_id) then raise exception 'Template not found' using errcode='P0002'; end if;
  select * into v from public.request_template_versions where template_id=t.id order by revision desc limit 1;
  if not found then raise exception 'Template has no saved version' using errcode='22023'; end if;
  if not exists(select 1 from public.request_template_version_fields where version_id=v.id) then raise exception 'Template has no requested fields' using errcode='22023'; end if;
  if coalesce(p_one_time,false) and p_expires_at is null then p_expires_at:=now()+interval '24 hours'; end if;
  if p_expires_at is not null and p_expires_at<=now() then raise exception 'Link expiry must be in the future' using errcode='22023'; end if;
  insert into public.organization_request_links(organization_id,template_id,template_version_id,created_by,token,token_hash,one_time,expires_at)
    values(t.organization_id,t.id,v.id,auth.uid(),raw_token,encode(extensions.digest(raw_token,'sha256'),'hex'),coalesce(p_one_time,false),p_expires_at)
    returning id into link_id;
  return jsonb_build_object('linkId',link_id,'token',raw_token,'templateId',t.id,'templateName',v.name,'oneTime',coalesce(p_one_time,false),'expiresAt',p_expires_at);
end $$;

create or replace function public.revoke_request_link(p_link_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp
as $$ declare changed integer;
begin
  update public.organization_request_links set revoked_at=now() where id=p_link_id and public.is_org_member(organization_id) and revoked_at is null;
  get diagnostics changed=row_count;
  return changed=1;
end $$;

create or replace function public.create_request_session(p_template_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare t public.request_templates%rowtype; v public.request_template_versions%rowtype; new_session_id uuid:=gen_random_uuid(); raw_nonce text:=encode(extensions.gen_random_bytes(16),'hex'); expiry timestamptz:=now()+interval '2 minutes';
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into t from public.request_templates where id=p_template_id and not is_archived for share;
  if not found or not public.is_org_member(t.organization_id) then raise exception 'Template not found' using errcode='P0002'; end if;
  select * into v from public.request_template_versions where template_id=t.id order by revision desc limit 1;
  if not found then raise exception 'Template has no saved version' using errcode='22023'; end if;
  insert into public.request_sessions(id,organization_id,template_id,template_version_id,created_by,nonce_hash,expires_at,retention_days)
    values(new_session_id,t.organization_id,t.id,v.id,auth.uid(),encode(extensions.digest(raw_nonce,'sha256'),'hex'),expiry,v.retention_days);
  insert into public.request_session_fields(session_id,field_key,required,display_order)
    select new_session_id,field_key,required,display_order from public.request_template_version_fields where version_id=v.id;
  if not exists(select 1 from public.request_session_fields where session_id=new_session_id) then raise exception 'Template has no requested fields' using errcode='22023'; end if;
  return jsonb_build_object('version',2,'requestSessionId',new_session_id,'nonce',raw_nonce,'expiresAt',expiry,'organizationId',t.organization_id,
    'organizationName',(select name from public.organizations where id=t.organization_id),'purpose',v.purpose,'templateName',v.name,'retentionDescription',v.retention_description,
    'templateVersionId',v.id,'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'type',q.question_type,'required',q.required,'options',q.options,'minLength',q.min_length,'maxLength',q.max_length,'minValue',q.min_value,'maxValue',q.max_value,'displayOrder',q.display_order) order by q.display_order)
      from public.request_template_version_questions q where q.version_id=v.id),'[]'::jsonb));
end $$;

create or replace function public.resolve_request_link(p_token text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare l public.organization_request_links%rowtype; v public.request_template_versions%rowtype; new_session_id uuid:=gen_random_uuid(); raw_nonce text:=encode(extensions.gen_random_bytes(16),'hex'); expiry timestamptz:=now()+interval '2 minutes'; rs public.request_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then raise exception 'Invalid request link' using errcode='22023'; end if;
  select * into l from public.organization_request_links where token_hash=encode(extensions.digest(lower(p_token),'sha256'),'hex') for update;
  if not found or l.revoked_at is not null or l.expires_at is not null and l.expires_at<=now() or l.used_at is not null then raise exception 'This request link has expired or was revoked' using errcode='P0001'; end if;
  if exists(select 1 from public.organization_members where organization_id=l.organization_id and user_id=auth.uid()) then raise exception 'Organization members cannot complete their own request link' using errcode='42501'; end if;
  if l.one_time and l.reserved_session_id is not null then
    select * into rs from public.request_sessions where id=l.reserved_session_id;
    if found and rs.status in ('created','awaiting_consent') and rs.expires_at>now() then raise exception 'This one-time request is already being reviewed' using errcode='23505'; end if;
    update public.organization_request_links set reserved_session_id=null where id=l.id;
  end if;
  select * into v from public.request_template_versions where id=l.template_version_id;
  if not found then raise exception 'This request template is unavailable' using errcode='P0002'; end if;
  insert into public.request_sessions(id,organization_id,template_id,template_version_id,request_link_id,created_by,nonce_hash,expires_at,retention_days)
    values(new_session_id,l.organization_id,l.template_id,l.template_version_id,l.id,l.created_by,encode(extensions.digest(raw_nonce,'sha256'),'hex'),expiry,v.retention_days);
  insert into public.request_session_fields(session_id,field_key,required,display_order)
    select new_session_id,field_key,required,display_order from public.request_template_version_fields where version_id=v.id;
  if l.one_time then update public.organization_request_links set reserved_session_id=new_session_id where id=l.id; end if;
  return jsonb_build_object('version',2,'requestSessionId',new_session_id,'nonce',raw_nonce,'expiresAt',expiry,'organizationId',l.organization_id,
    'organizationName',(select name from public.organizations where id=l.organization_id),'purpose',v.purpose,'templateName',v.name,'retentionDescription',v.retention_description,
    'templateVersionId',v.id,'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'type',q.question_type,'required',q.required,'options',q.options,'minLength',q.min_length,'maxLength',q.max_length,'minValue',q.min_value,'maxValue',q.max_value,'displayOrder',q.display_order) order by q.display_order)
      from public.request_template_version_questions q where q.version_id=v.id),'[]'::jsonb));
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
  update public.request_sessions set status='awaiting_consent',joined_user_id=auth.uid(),joined_at=now(),nonce_hash=repeat('0',64),expires_at=now()+interval '15 minutes' where id=s.id;
  return (select jsonb_build_object('sessionId',rs.id,'organizationId',rs.organization_id,'organizationName',o.name,'organizationStatus',o.verification_status,'purpose',v.purpose,'templateName',v.name,'retentionDescription',v.retention_description,'expiresAt',rs.expires_at,'templateVersionId',v.id,
    'fields',coalesce((select jsonb_agg(jsonb_build_object('key',sf.field_key,'required',sf.required,'displayOrder',sf.display_order) order by sf.display_order) from public.request_session_fields sf where sf.session_id=rs.id),'[]'::jsonb),
    'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'prompt',q.prompt,'type',q.question_type,'required',q.required,'options',q.options,'minLength',q.min_length,'maxLength',q.max_length,'minValue',q.min_value,'maxValue',q.max_value,'displayOrder',q.display_order) order by q.display_order) from public.request_template_version_questions q where q.version_id=rs.template_version_id),'[]'::jsonb))
    from public.request_sessions rs join public.organizations o on o.id=rs.organization_id join public.request_template_versions v on v.id=rs.template_version_id where rs.id=s.id);
end $$;

create or replace function public.validate_request_answers(p_version_id uuid,p_answers jsonb)
returns smallint language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare q record; answer jsonb; value_text text; multi_count integer; option text; option_value text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists (
    select 1 from public.request_template_versions v
    where v.id=p_version_id
      and (public.is_org_member(v.organization_id) or exists (
        select 1 from public.request_sessions rs
        where rs.template_version_id=v.id and rs.joined_user_id=auth.uid()
      ))
  ) then raise exception 'Request version not found' using errcode='P0002'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'object' or public.jsonb_object_key_count(p_answers)>50 then raise exception 'Answers must be an object' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_answers) a where not exists(select 1 from public.request_template_version_questions qt where qt.version_id=p_version_id and qt.id::text=a)) then
    raise exception 'An answer does not belong to this request version' using errcode='22023';
  end if;
  for q in select * from public.request_template_version_questions where version_id=p_version_id order by display_order loop
    answer:=p_answers->q.id::text;
    if answer is null or answer='null'::jsonb then
      if q.required then raise exception 'A required question is unanswered' using errcode='23514'; end if;
      continue;
    end if;
    case q.question_type
      when 'short_text','long_text' then
        if jsonb_typeof(answer)<>'string' then raise exception 'A text answer has an invalid format' using errcode='23514'; end if;
        value_text:=answer#>>'{}';
        if char_length(value_text)<q.min_length or char_length(value_text)>q.max_length or q.required and char_length(trim(value_text))=0 then raise exception 'A text answer is outside the allowed length' using errcode='23514'; end if;
      when 'single_choice' then
        if jsonb_typeof(answer)<>'string' or not exists(select 1 from jsonb_array_elements_text(q.options) as opts(value) where opts.value=answer#>>'{}') then raise exception 'A choice answer is not allowed' using errcode='23514'; end if;
      when 'multiple_choice' then
        if jsonb_typeof(answer)<>'array' or jsonb_array_length(answer)>jsonb_array_length(q.options) or (q.required and jsonb_array_length(answer)=0)
          or (select count(distinct x#>>'{}') from jsonb_array_elements(answer) x)<>jsonb_array_length(answer)
          or exists(select 1 from jsonb_array_elements(answer) x where jsonb_typeof(x)<>'string' or not exists(select 1 from jsonb_array_elements_text(q.options) as opts(value) where opts.value=x#>>'{}')) then
          raise exception 'A multiple-choice answer is not allowed' using errcode='23514';
        end if;
      when 'yes_no' then
        if jsonb_typeof(answer)<>'boolean' then raise exception 'A yes/no answer must be selected' using errcode='23514'; end if;
      when 'number' then
        if jsonb_typeof(answer)<>'number' or q.min_value is not null and (answer#>>'{}')::numeric<q.min_value or q.max_value is not null and (answer#>>'{}')::numeric>q.max_value then raise exception 'A number answer is outside the allowed range' using errcode='23514'; end if;
      when 'date' then
        if jsonb_typeof(answer)<>'string' or (answer#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'A date answer must use YYYY-MM-DD' using errcode='23514'; end if;
        begin if to_char((answer#>>'{}')::date,'YYYY-MM-DD')<>(answer#>>'{}') then raise exception 'Invalid date' using errcode='23514'; end if;
        exception when others then raise exception 'A date answer is invalid' using errcode='23514'; end;
    end case;
  end loop;
  return (select count(*)::smallint from jsonb_each(p_answers));
end $$;

create or replace function public.respond_to_request(
  p_session_id uuid,p_approved boolean,p_approved_keys text[],p_answers jsonb,p_missing_values jsonb,p_save_missing_keys text[]
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$ declare s public.request_sessions%rowtype; l public.organization_request_links%rowtype; new_response_id uuid:=gen_random_uuid(); missing_keys text[]; answer_count smallint:=0; shared_count smallint:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
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

-- Keep the previous RPC shape for installed clients; questions and missing
-- values still validate server-side and cannot be silently bypassed.
create or replace function public.respond_to_request(p_session_id uuid,p_approved boolean,p_approved_keys text[] default '{}')
returns jsonb language sql security definer set search_path=public,pg_temp
as $$ select public.respond_to_request(p_session_id,p_approved,p_approved_keys,'{}'::jsonb,'{}'::jsonb,'{}'::text[]) $$;

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
    'sentPeerTransfers',coalesce((select jsonb_agg(jsonb_build_object('recipient',coalesce(p.display_name,''),'card',t.card_name_snapshot,'fieldCount',t.field_count,'values',t.values_snapshot,'completedAt',t.completed_at))
      from public.peer_transfers t join public.profiles p on p.id=t.receiver_user_id where t.sender_user_id=auth.uid()),'[]'::jsonb)
  ) into result from public.profiles p where p.id=auth.uid();
  return coalesce(result,'{}'::jsonb);
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path=public,auth,pg_temp
as $$ declare account_id uuid:=auth.uid();
begin
  if account_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  delete from public.organizations where owner_user_id=account_id;
  delete from auth.users where id=account_id;
  if not found then raise exception 'Account could not be deleted' using errcode='P0002'; end if;
end $$;

-- Explicit access grants; all sensitive writes go through owner-checked RPCs.
alter table public.tap_cards enable row level security;
alter table public.tap_card_fields enable row level security;
alter table public.organization_preferences enable row level security;
alter table public.request_template_versions enable row level security;
alter table public.request_template_version_fields enable row level security;
alter table public.request_template_version_questions enable row level security;
alter table public.organization_request_links enable row level security;
alter table public.peer_share_links enable row level security;
alter table public.peer_exchange_sessions enable row level security;
alter table public.peer_transfers enable row level security;
alter table public.received_cards enable row level security;

drop policy if exists templates_member_all on public.request_templates;
drop policy if exists templates_member_select on public.request_templates;
create policy templates_member_select on public.request_templates for select to authenticated using(public.is_org_member(organization_id));
drop policy if exists templates_member_insert on public.request_templates;
create policy templates_member_insert on public.request_templates for insert to authenticated with check(public.is_org_member(organization_id) and created_by=auth.uid());
drop policy if exists templates_member_update on public.request_templates;
create policy templates_member_update on public.request_templates for update to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id) and (created_by=auth.uid() or created_by is null));

grant select on public.tap_cards,public.tap_card_fields to authenticated;
revoke insert,update,delete on public.tap_cards,public.tap_card_fields from authenticated;
grant select on public.organization_preferences,public.request_template_versions,public.request_template_version_fields,public.request_template_version_questions,public.organization_request_links,public.peer_share_links,public.peer_exchange_sessions,public.peer_transfers,public.received_cards to authenticated;
grant update(saved_at,archived_at) on public.received_cards to authenticated;
revoke insert,update,delete on public.request_templates,public.request_template_fields from authenticated;
grant select on public.request_templates,public.request_template_fields to authenticated;

drop policy if exists tap_cards_owner_all on public.tap_cards;
create policy tap_cards_owner_all on public.tap_cards for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists tap_card_fields_owner_all on public.tap_card_fields;
create policy tap_card_fields_owner_all on public.tap_card_fields for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.tap_cards c where c.id=card_id and c.user_id=auth.uid()));
drop policy if exists organization_preferences_member_select on public.organization_preferences;
create policy organization_preferences_member_select on public.organization_preferences for select to authenticated using(public.is_org_member(organization_id));
drop policy if exists template_versions_member_or_requester_select on public.request_template_versions;
create policy template_versions_member_or_requester_select on public.request_template_versions for select to authenticated using(public.is_org_member(organization_id) or exists(select 1 from public.request_sessions s where s.template_version_id=id and s.joined_user_id=auth.uid()));
drop policy if exists template_version_fields_member_or_requester_select on public.request_template_version_fields;
create policy template_version_fields_member_or_requester_select on public.request_template_version_fields for select to authenticated using(exists(select 1 from public.request_template_versions v where v.id=version_id and (public.is_org_member(v.organization_id) or exists(select 1 from public.request_sessions s where s.template_version_id=v.id and s.joined_user_id=auth.uid()))));
drop policy if exists template_version_questions_member_or_requester_select on public.request_template_version_questions;
create policy template_version_questions_member_or_requester_select on public.request_template_version_questions for select to authenticated using(exists(select 1 from public.request_template_versions v where v.id=version_id and (public.is_org_member(v.organization_id) or exists(select 1 from public.request_sessions s where s.template_version_id=v.id and s.joined_user_id=auth.uid()))));
drop policy if exists organization_request_links_member_select on public.organization_request_links;
create policy organization_request_links_member_select on public.organization_request_links for select to authenticated using(public.is_org_member(organization_id));
drop policy if exists peer_share_links_owner_select on public.peer_share_links;
create policy peer_share_links_owner_select on public.peer_share_links for select to authenticated using(owner_user_id=auth.uid());
drop policy if exists peer_exchange_participant_select on public.peer_exchange_sessions;
create policy peer_exchange_participant_select on public.peer_exchange_sessions for select to authenticated using(sender_user_id=auth.uid() or receiver_user_id=auth.uid());
drop policy if exists peer_transfers_participant_select on public.peer_transfers;
create policy peer_transfers_participant_select on public.peer_transfers for select to authenticated using(sender_user_id=auth.uid() or receiver_user_id=auth.uid());
drop policy if exists received_cards_owner_select on public.received_cards;
create policy received_cards_owner_select on public.received_cards for select to authenticated using(receiver_user_id=auth.uid());
drop policy if exists received_cards_owner_update on public.received_cards;
create policy received_cards_owner_update on public.received_cards for update to authenticated using(receiver_user_id=auth.uid()) with check(receiver_user_id=auth.uid());

revoke all on function public.is_valid_field_key(text) from public;
grant execute on function public.is_valid_field_key(text) to authenticated;
revoke all on function public.jsonb_object_key_count(jsonb) from public;
grant execute on function public.jsonb_object_key_count(jsonb) to authenticated;
revoke all on function public.save_tap_card(uuid,text,text,text[],timestamptz) from public;
grant execute on function public.save_tap_card(uuid,text,text,text[],timestamptz) to authenticated;
revoke all on function public.set_default_tap_card(uuid) from public;
grant execute on function public.set_default_tap_card(uuid) to authenticated;
revoke all on function public.delete_tap_card(uuid) from public;
grant execute on function public.delete_tap_card(uuid) to authenticated;
revoke all on function public.reorder_tap_cards(uuid[]) from public;
grant execute on function public.reorder_tap_cards(uuid[]) to authenticated;
revoke all on function public.create_card_share_link(uuid,boolean,timestamptz,uuid) from public;
grant execute on function public.create_card_share_link(uuid,boolean,timestamptz,uuid) to authenticated;
revoke all on function public.revoke_card_share_link(uuid) from public;
grant execute on function public.revoke_card_share_link(uuid) to authenticated;
revoke all on function public.join_card_share(text,uuid) from public;
grant execute on function public.join_card_share(text,uuid) to authenticated;
revoke all on function public.respond_to_peer_exchange(uuid,text,boolean) from public;
grant execute on function public.respond_to_peer_exchange(uuid,text,boolean) to authenticated;
revoke all on function public.save_received_card(uuid,boolean) from public;
grant execute on function public.save_received_card(uuid,boolean) to authenticated;
revoke all on function public.archive_received_card(uuid) from public;
grant execute on function public.archive_received_card(uuid) to authenticated;
revoke all on function public.archive_request_template(uuid) from public;
grant execute on function public.archive_request_template(uuid) to authenticated;
revoke all on function public.save_request_template(uuid,text,text,smallint,jsonb,jsonb,text) from public;
grant execute on function public.save_request_template(uuid,text,text,smallint,jsonb,jsonb,text) to authenticated;
revoke all on function public.set_default_request_template(uuid) from public;
grant execute on function public.set_default_request_template(uuid) to authenticated;
revoke all on function public.create_request_link(uuid,boolean,timestamptz) from public;
grant execute on function public.create_request_link(uuid,boolean,timestamptz) to authenticated;
revoke all on function public.revoke_request_link(uuid) from public;
grant execute on function public.revoke_request_link(uuid) to authenticated;
revoke all on function public.create_request_session(uuid) from public;
grant execute on function public.create_request_session(uuid) to authenticated;
revoke all on function public.resolve_request_link(text) from public;
grant execute on function public.resolve_request_link(text) to authenticated;
revoke all on function public.join_request_session(uuid,text) from public;
grant execute on function public.join_request_session(uuid,text) to authenticated;
revoke all on function public.validate_request_answers(uuid,jsonb) from public;
grant execute on function public.validate_request_answers(uuid,jsonb) to authenticated;
revoke all on function public.respond_to_request(uuid,boolean,text[],jsonb,jsonb,text[]) from public;
grant execute on function public.respond_to_request(uuid,boolean,text[],jsonb,jsonb,text[]) to authenticated;
revoke all on function public.respond_to_request(uuid,boolean,text[]) from public;
grant execute on function public.respond_to_request(uuid,boolean,text[]) to authenticated;
revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

do $$ begin alter publication supabase_realtime add table public.peer_transfers; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.received_cards; exception when duplicate_object then null; end $$;

-- Keep expiration and retention enforcement active without a client-side job.
create extension if not exists pg_cron;
do $$ declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='tapform-expiry-and-retention';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('tapform-expiry-and-retention','15 * * * *','select public.purge_expired_shared_values()');
end $$;
