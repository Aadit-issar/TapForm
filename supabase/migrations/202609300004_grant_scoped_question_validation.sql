-- This read-only helper verifies a question payload for a request version.
-- Its body restricts callers to that version's organization members or the
-- participant of a session pinned to the version.
grant execute on function public.validate_request_answers(uuid, jsonb) to authenticated;
