-- Profile rows are client-readable only. Keep writes scoped to the caller and
-- expose only the non-sensitive display name mutation needed by the app.
create or replace function public.update_my_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_name text := trim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(saved_name) > 100 then
    raise exception 'Sharing name must be 100 characters or fewer' using errcode = '22023';
  end if;

  update public.profiles
    set display_name = saved_name, updated_at = now()
    where id = auth.uid();
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  return saved_name;
end;
$$;

revoke all on function public.update_my_display_name(text) from public, anon, authenticated;
grant execute on function public.update_my_display_name(text) to authenticated;
