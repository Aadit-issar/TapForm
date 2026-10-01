-- Supabase's default privileges explicitly grant public-schema functions to
-- anon. Remove those grants from TapForm's privileged RPCs; the RPC bodies
-- also verify auth.uid(), but anonymous clients should not invoke them.
revoke all on function public.is_org_member(uuid) from anon, public;
revoke all on function public.create_organization(text,text,text) from anon, public;
revoke all on function public.create_request_session(uuid) from anon, public;
revoke all on function public.join_request_session(uuid,text) from anon, public;
revoke all on function public.respond_to_request(uuid,boolean,text[]) from anon, public;
revoke all on function public.purge_expired_shared_values() from anon, authenticated, public;
revoke all on function public.save_request_template(uuid,text,text,smallint,jsonb) from anon, public;
-- The fixture helper is created by supabase/seed.sql after migrations, so it
-- is absent on a clean database when this migration runs.
do $$ begin
  if to_regprocedure('public.seed_demo_account(text)') is not null then
    execute 'revoke all on function public.seed_demo_account(text) from anon, public';
  end if;
end $$;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.create_organization(text,text,text) to authenticated;
grant execute on function public.create_request_session(uuid) to authenticated;
grant execute on function public.join_request_session(uuid,text) to authenticated;
grant execute on function public.respond_to_request(uuid,boolean,text[]) to authenticated;
grant execute on function public.purge_expired_shared_values() to service_role;
grant execute on function public.save_request_template(uuid,text,text,smallint,jsonb) to authenticated;
