create or replace function public.validate_request_answers(p_version_id uuid,p_answers jsonb)
returns smallint language plpgsql stable security definer set search_path=public,pg_temp
as $$ declare q record; answer jsonb; value_text text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists (
    select 1 from public.request_template_versions v
    where v.id=p_version_id
      and (public.is_org_member(v.organization_id) or exists (
        select 1 from public.request_sessions rs
        where rs.template_version_id=v.id and rs.joined_user_id=auth.uid()
      ))
  ) then raise exception 'Request version not found' using errcode='P0002'; end if;
  if p_answers is null or jsonb_typeof(p_answers)<>'object' or public.jsonb_object_key_count(p_answers)>50 then raise exception 'Answers must be an object' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_answers) a where not exists(select 1 from public.request_template_version_questions qt where qt.version_id=p_version_id and qt.id::text=a)) then
    raise exception 'An answer does not belong to this request version' using errcode='22023';
  end if;
  for q in select * from public.request_template_version_questions where version_id=p_version_id order by display_order loop
    answer:=p_answers->q.id::text;
    if answer is null or answer='null'::jsonb then
      if q.required then raise exception 'A required question is unanswered' using errcode='23514'; end if;
      continue;
    end if;
    if jsonb_typeof(answer)='string' and btrim(answer#>>'{}')='' then
      if q.required then raise exception 'A required question is unanswered' using errcode='23514'; end if;
      continue;
    end if;
    if q.question_type='multiple_choice' and jsonb_typeof(answer)='array' and jsonb_array_length(answer)=0 then
      if q.required then raise exception 'A required question is unanswered' using errcode='23514'; end if;
      continue;
    end if;
    case q.question_type
      when 'short_text','long_text' then
        if jsonb_typeof(answer)<>'string' then raise exception 'A text answer has an invalid format' using errcode='23514'; end if;
        value_text:=answer#>>'{}';
        if char_length(value_text)<q.min_length or char_length(value_text)>q.max_length or q.required and char_length(trim(value_text))=0 then raise exception 'A text answer is outside the allowed length' using errcode='23514'; end if;
      when 'single_choice' then
        if jsonb_typeof(answer)<>'string' or not exists(select 1 from jsonb_array_elements_text(q.options) as opts(value) where opts.value=answer#>>'{}') then raise exception 'A choice answer is not allowed' using errcode='23514'; end if;
      when 'multiple_choice' then
        if jsonb_typeof(answer)<>'array' or jsonb_array_length(answer)>jsonb_array_length(q.options) or (q.required and jsonb_array_length(answer)=0)
          or (select count(distinct x#>>'{}') from jsonb_array_elements(answer) x)<>jsonb_array_length(answer)
          or exists(select 1 from jsonb_array_elements(answer) x where jsonb_typeof(x)<>'string' or not exists(select 1 from jsonb_array_elements_text(q.options) as opts(value) where opts.value=x#>>'{}')) then
          raise exception 'A multiple-choice answer is not allowed' using errcode='23514';
        end if;
      when 'yes_no' then
        if jsonb_typeof(answer)<>'boolean' then raise exception 'A yes/no answer must be selected' using errcode='23514'; end if;
      when 'number' then
        if jsonb_typeof(answer)<>'number' or q.min_value is not null and (answer#>>'{}')::numeric<q.min_value or q.max_value is not null and (answer#>>'{}')::numeric>q.max_value then raise exception 'A number answer is outside the allowed range' using errcode='23514'; end if;
      when 'date' then
        if jsonb_typeof(answer)<>'string' or (answer#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'A date answer must use YYYY-MM-DD' using errcode='23514'; end if;
        begin if to_char((answer#>>'{}')::date,'YYYY-MM-DD')<>(answer#>>'{}') then raise exception 'Invalid date' using errcode='23514'; end if;
        exception when others then raise exception 'A date answer is invalid' using errcode='23514'; end;
    end case;
  end loop;
  return (
    select count(*)::smallint
    from jsonb_each(p_answers) e
    where case jsonb_typeof(e.value)
      when 'null' then false
      when 'string' then btrim(e.value#>>'{}')<>''
      when 'array' then jsonb_array_length(e.value)>0
      else true
    end
  );
end $$;
