-- Organization Submissions listens for new and completed request sessions.
-- RLS continues to authorize each Postgres Changes payload to organization members
-- and the participant who joined the request.
do $$
begin
  alter publication supabase_realtime add table public.request_sessions;
exception
  when duplicate_object then null;
end;
$$;
