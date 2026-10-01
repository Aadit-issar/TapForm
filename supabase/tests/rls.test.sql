begin;
select plan(64);

create function pg_temp.tapform_rls_enabled(p_schema text, p_table text)
returns boolean language sql stable
as $$
  select exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname=p_schema and c.relname=p_table and c.relrowsecurity
  )
$$;

create function pg_temp.tapform_policy_names(p_schema text, p_table text)
returns text[] language sql stable
as $$
  select coalesce(array_agg(policyname order by policyname), '{}'::text[])
  from pg_catalog.pg_policies
  where schemaname=p_schema and tablename=p_table
$$;

-- Every user- and organization-owned entity has RLS enabled.
select ok(pg_temp.tapform_rls_enabled('public', 'profiles'), 'profiles use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'personal_fields'), 'private Vault fields use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'organizations'), 'organizations use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'organization_members'), 'organization memberships use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'request_templates'), 'request templates use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'request_template_fields'), 'mutable template fields use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'request_sessions'), 'request sessions use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'request_session_fields'), 'session field snapshots use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'request_responses'), 'request responses use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'shared_values'), 'immutable Vault snapshots use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'tap_cards'), 'Tap Cards use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'tap_card_fields'), 'Tap Card field selection uses RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'organization_preferences'), 'organization defaults use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'request_template_versions'), 'immutable template versions use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'request_template_version_fields'), 'versioned requested fields use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'request_template_version_questions'), 'versioned questions use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'organization_request_links'), 'organization QR links use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'peer_share_links'), 'personal share links use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'peer_exchange_sessions'), 'peer exchange sessions use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'peer_transfers'), 'peer transfer receipts use RLS');
select ok(pg_temp.tapform_rls_enabled('public', 'received_cards'), 'received contact cards use RLS');

-- Policy names and predicates encode the ownership boundary.
select is(pg_temp.tapform_policy_names('public', 'personal_fields'), array[
  'fields_delete_own', 'fields_insert_own', 'fields_select_own', 'fields_update_own'
], 'Vault policies are owner scoped');
select is(pg_temp.tapform_policy_names('public', 'shared_values'), array[
  'shared_values_personal_or_org_select'
], 'organizations can read only approved snapshots');
select is(pg_temp.tapform_policy_names('public', 'tap_cards'), array[
  'tap_cards_owner_all'
], 'Tap Cards are owner scoped');
select is(pg_temp.tapform_policy_names('public', 'tap_card_fields'), array[
  'tap_card_fields_owner_all'
], 'Tap Card field selections are owner scoped');
select is(pg_temp.tapform_policy_names('public', 'organization_request_links'), array[
  'organization_request_links_member_select'
], 'request QR links are visible only to organization members');
select is(pg_temp.tapform_policy_names('public', 'peer_transfers'), array[
  'peer_transfers_participant_select'
], 'peer receipts are visible only to sender and receiver');
select is(pg_temp.tapform_policy_names('public', 'received_cards'), array[
  'received_cards_owner_select', 'received_cards_owner_update'
], 'received cards are limited to their receiver');

-- No anonymous access, no direct client writes to server-owned snapshots or links.
select ok(not has_table_privilege('anon', 'public.personal_fields', 'select'), 'anonymous users cannot read Vault fields');
select ok(not has_table_privilege('anon', 'public.shared_values', 'select'), 'anonymous users cannot read shared snapshots');
select ok(not has_table_privilege('authenticated', 'public.tap_cards', 'insert'), 'Tap Cards must be written through owner-checked RPCs');
select ok(not has_table_privilege('authenticated', 'public.tap_cards', 'update'), 'clients cannot mutate Tap Card rows directly');
select ok(not has_table_privilege('authenticated', 'public.organization_request_links', 'update'), 'clients cannot change or un-revoke request links directly');
select ok(not has_table_privilege('authenticated', 'public.request_responses', 'insert'), 'clients cannot create or forge response receipts');
select ok(not has_table_privilege('authenticated', 'public.shared_values', 'insert'), 'clients cannot forge shared Vault snapshots');
select ok(not has_table_privilege('authenticated', 'public.peer_transfers', 'insert'), 'clients cannot forge peer transfer receipts');
select ok(not has_table_privilege('authenticated', 'public.peer_transfers', 'update'), 'peer receipts are immutable');

-- All mutation and privileged routines require authenticated calls and validate ownership server side.
select ok(has_function_privilege('authenticated', 'public.respond_to_request(uuid,boolean,text[],jsonb,jsonb,text[])', 'execute'), 'consent uses the version-aware server RPC');
select ok(has_function_privilege('authenticated', 'public.save_request_template(uuid,text,text,smallint,jsonb,jsonb,text)', 'execute'), 'templates are saved as validated immutable versions');
select ok(not has_function_privilege('anon', 'public.save_request_template(uuid,text,text,smallint,jsonb,jsonb,text)', 'execute'), 'anonymous users cannot mutate templates');
select ok(has_function_privilege('authenticated', 'public.set_default_tap_card(uuid)', 'execute'), 'users can set their own Tap Card default');
select ok(has_function_privilege('authenticated', 'public.create_request_link(uuid,boolean,timestamptz)', 'execute'), 'organization QR creation is server checked');
select ok(has_function_privilege('authenticated', 'public.revoke_request_link(uuid)', 'execute'), 'organization QR revocation is server checked');
select ok(has_function_privilege('authenticated', 'public.create_card_share_link(uuid,boolean,timestamptz,uuid)', 'execute'), 'personal share links are server checked');
select ok(has_function_privilege('authenticated', 'public.join_card_share(text,uuid)', 'execute'), 'peer exchange joins validate token, expiry, and replay');
select ok(has_function_privilege('authenticated', 'public.respond_to_peer_exchange(uuid,text,boolean)', 'execute'), 'peer consent is validated server side');
select ok(not has_function_privilege('anon', 'public.resolve_request_link(text)', 'execute'), 'anonymous callers cannot resolve request links');
select ok(has_function_privilege('authenticated', 'public.export_my_data()', 'execute'), 'users can export their own data');
select ok(has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'), 'users can delete only their authenticated account');
select ok(not has_function_privilege('anon', 'public.delete_my_account()', 'execute'), 'anonymous callers cannot delete accounts');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_shared_values()', 'execute'), 'users cannot run retention cleanup');
select ok(not has_function_privilege('anon', 'public.purge_expired_shared_values()', 'execute'), 'anonymous clients cannot run retention cleanup');
select ok(not has_function_privilege('anon', 'public.is_org_member(uuid)', 'execute'), 'anonymous users cannot probe organization membership');
select ok(not has_function_privilege('anon', 'public.create_organization(text,text,text)', 'execute'), 'anonymous users cannot create organizations');
select ok(not has_function_privilege('anon', 'public.create_request_session(uuid)', 'execute'), 'anonymous users cannot create request sessions');

select ok(not exists (
  select 1
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and (
      has_table_privilege('anon', c.oid, 'select')
      or has_table_privilege('anon', c.oid, 'insert')
      or has_table_privilege('anon', c.oid, 'update')
      or has_table_privilege('anon', c.oid, 'delete')
    )
), 'anonymous clients have no direct public relation privileges');
select ok(not exists (
  select 1
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute')
), 'anonymous clients cannot execute public routines');
select ok(not has_function_privilege('authenticated', 'public.respond_to_request(uuid,boolean,text[])', 'execute'), 'legacy response overload is not exposed to authenticated clients');
select ok(not exists (
  select 1
  from pg_catalog.pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) acl
  join pg_catalog.pg_roles owner_role on owner_role.oid = d.defaclrole
  left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
  where owner_role.rolname = 'postgres'
    and (d.defaclnamespace = 0 or n.nspname = 'public')
    and d.defaclobjtype in ('r', 'S', 'f')
    and (
      acl.grantee = 0
      or acl.grantee in (select oid from pg_catalog.pg_roles where rolname in ('anon', 'authenticated'))
    )
), 'future public objects do not inherit API-role grants');

-- Keep high-value realtime flows available without opening broader table access.
select is((select count(*)::integer from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='request_sessions'), 1, 'request session updates publish to Realtime');
select is((select count(*)::integer from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='request_responses'), 1, 'request response updates publish to Realtime');
select is((select count(*)::integer from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='peer_transfers'), 1, 'peer receipt updates publish to Realtime');
select is((select count(*)::integer from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='received_cards'), 1, 'received card changes publish to Realtime');
select is((select count(*)::integer from cron.job where jobname='tapform-expiry-and-retention'), 1, 'expiry and retention cleanup is scheduled in Supabase Cron');

select * from finish();
rollback;
