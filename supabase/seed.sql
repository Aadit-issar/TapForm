-- Local development only. Supabase runs this file after local migrations when
-- resetting the configured development database. Never run it in production.
create or replace function public.seed_demo_account(p_mode text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$ declare org_id uuid; template_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_mode='personal' then
    update public.profiles set display_name='Alex Morgan',role='personal',updated_at=now() where id=auth.uid();
    insert into public.personal_fields(user_id,field_key,value) values
      (auth.uid(),'full_name','Alex Morgan'),(auth.uid(),'preferred_name','Alex'),(auth.uid(),'date_of_birth','2009-03-14'),
      (auth.uid(),'phone','+1 (555) 013-2846'),(auth.uid(),'email','alex.morgan@example.test'),(auth.uid(),'address','48 Cedar Lane'),
      (auth.uid(),'city','Fairview'),(auth.uid(),'state','Oregon'),(auth.uid(),'postal_code','97024'),(auth.uid(),'country','United States'),
      (auth.uid(),'institution','Northfield Academy'),(auth.uid(),'grade','11'),(auth.uid(),'emergency_name','Jordan Morgan'),
      (auth.uid(),'emergency_relationship','Parent'),(auth.uid(),'emergency_phone','+1 (555) 013-9271')
      on conflict(user_id,field_key) do update set value=excluded.value,updated_at=now();
    return jsonb_build_object('mode','personal','name','Alex Morgan');
  elsif p_mode='organization' then
    select id into org_id from public.organizations where owner_user_id=auth.uid() and name='Northfield Tech Fest' limit 1;
    if org_id is null then
      insert into public.organizations(owner_user_id,name,organization_type,contact_email)
        values(auth.uid(),'Northfield Tech Fest','Education event','demo@northfield.example') returning id into org_id;
      insert into public.organization_members(organization_id,user_id,member_role) values(org_id,auth.uid(),'owner');
    end if;
    select id into template_id from public.request_templates where organization_id=org_id and name='Event Registration' limit 1;
    if template_id is null then
      insert into public.request_templates(organization_id,created_by,name,purpose,retention_description)
        values(org_id,auth.uid(),'Event Registration','Participant registration','30 days') returning id into template_id;
      insert into public.request_template_fields(template_id,field_key,required,display_order) values
        (template_id,'full_name',true,1),(template_id,'date_of_birth',true,2),(template_id,'institution',true,3),
        (template_id,'grade',true,4),(template_id,'emergency_name',true,5),(template_id,'phone',false,6);
    end if;
    update public.profiles set display_name='Northfield Tech Fest',role='organization',updated_at=now() where id=auth.uid();
    return jsonb_build_object('mode','organization','organizationId',org_id,'templateId',template_id,'name','Northfield Tech Fest');
  else raise exception 'Demo mode must be personal or organization' using errcode='22023';
  end if;
end $$;
revoke all on function public.seed_demo_account(text) from public;
-- Local-only development UI can use fictional fixtures after `supabase db reset`.
grant execute on function public.seed_demo_account(text) to authenticated;
