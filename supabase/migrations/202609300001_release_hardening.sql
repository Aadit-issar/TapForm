-- Demo fixtures are available only in local seeded development databases.
-- The local Supabase seed file restores authenticated access after migrations;
-- production clients must never invoke this SECURITY DEFINER function.
do $$ begin
  if to_regprocedure('public.seed_demo_account(text)') is not null then
    execute 'revoke all on function public.seed_demo_account(text) from public, anon, authenticated';
  end if;
end $$;
revoke all on function public.purge_expired_shared_values() from public, anon, authenticated;
