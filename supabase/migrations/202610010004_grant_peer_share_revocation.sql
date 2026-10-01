-- Allow the share-link owner to revoke their own one-time or reusable link.
-- The SECURITY DEFINER function enforces ownership by auth.uid(); it remains
-- unavailable to anonymous callers and cannot affect another owner's links.
revoke all on function public.revoke_card_share_link(uuid) from public, anon, authenticated;
grant execute on function public.revoke_card_share_link(uuid) to authenticated;
