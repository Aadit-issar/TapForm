-- Qualify the outer table IDs. Without qualification PostgreSQL resolves these
-- names to the inner request_sessions.id column, hiding request context from
-- joined personal users in their history and related views.
drop policy if exists organizations_requester_select on public.organizations;
create policy organizations_requester_select on public.organizations
for select to authenticated
using (exists (
  select 1 from public.request_sessions s
  where s.organization_id = public.organizations.id
    and s.joined_user_id = auth.uid()
));

drop policy if exists templates_requester_select on public.request_templates;
create policy templates_requester_select on public.request_templates
for select to authenticated
using (exists (
  select 1 from public.request_sessions s
  where s.template_id = public.request_templates.id
    and s.joined_user_id = auth.uid()
));
