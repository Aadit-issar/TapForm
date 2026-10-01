-- Supabase projects with legacy public-schema defaults grant Data API roles
-- direct access to new tables and functions. RLS does not replace SQL grants.
-- Remove those grants, then restore only the operations used by TapForm.
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Supabase migrations and the SQL editor create user objects as postgres.
-- Alter only that owner: supabase_admin is a protected platform role.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
-- PUBLIC EXECUTE is a global PostgreSQL default, so this revoke must not be
-- schema-scoped. New routines stay private until explicitly granted.
alter default privileges for role postgres
  revoke execute on functions from public;

-- The client reads these rows under RLS. Vault values are the only rows users
-- edit directly; every other mutation goes through an ownership-checked RPC.
grant select on
  public.profiles,
  public.personal_fields,
  public.organizations,
  public.organization_members,
  public.request_templates,
  public.request_template_fields,
  public.request_sessions,
  public.request_session_fields,
  public.request_responses,
  public.shared_values,
  public.tap_cards,
  public.tap_card_fields,
  public.organization_preferences,
  public.request_template_versions,
  public.request_template_version_fields,
  public.request_template_version_questions,
  public.organization_request_links,
  public.peer_share_links,
  public.peer_exchange_sessions,
  public.peer_transfers,
  public.received_cards
to authenticated;

grant select, insert, update, delete on public.personal_fields to authenticated;

-- RLS policy helper required while selecting organization-owned rows.
grant execute on function public.is_org_member(uuid) to authenticated;

-- Only client-invoked mutation, exchange, export, and account RPCs are exposed.
grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.create_request_session(uuid) to authenticated;
grant execute on function public.join_request_session(uuid, text) to authenticated;
grant execute on function public.resolve_request_link(text) to authenticated;
grant execute on function public.respond_to_request(uuid, boolean, text[], jsonb, jsonb, text[]) to authenticated;
grant execute on function public.save_tap_card(uuid, text, text, text[], timestamptz) to authenticated;
grant execute on function public.set_default_tap_card(uuid) to authenticated;
grant execute on function public.delete_tap_card(uuid) to authenticated;
grant execute on function public.create_card_share_link(uuid, boolean, timestamptz, uuid) to authenticated;
grant execute on function public.join_card_share(text, uuid) to authenticated;
grant execute on function public.respond_to_peer_exchange(uuid, text, boolean) to authenticated;
grant execute on function public.save_received_card(uuid, boolean) to authenticated;
grant execute on function public.archive_received_card(uuid) to authenticated;
grant execute on function public.archive_request_template(uuid) to authenticated;
grant execute on function public.save_request_template(uuid, text, text, smallint, jsonb, jsonb, text) to authenticated;
grant execute on function public.set_default_request_template(uuid) to authenticated;
grant execute on function public.create_request_link(uuid, boolean, timestamptz) to authenticated;
grant execute on function public.revoke_request_link(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- Retention runs through Supabase Cron, never through a client RPC.
grant execute on function public.purge_expired_shared_values() to service_role;
