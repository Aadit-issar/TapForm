begin;
select plan(81);
create temporary table tapform_flow_payloads (flow_key text primary key,payload jsonb not null);
grant all on tapform_flow_payloads to authenticated;

-- Isolated fixture accounts. The transaction rolls back after the suite.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
values
 ('00000000-0000-0000-0000-000000000000','11110000-0000-0000-0000-000000000001','authenticated','authenticated','rls-person-a@example.test','',now(),now(),now(),'{}','{"display_name":"Person A"}'),
 ('00000000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000002','authenticated','authenticated','rls-person-b@example.test','',now(),now(),now(),'{}','{"display_name":"Person B"}'),
 ('00000000-0000-0000-0000-000000000003','11110000-0000-0000-0000-000000000003','authenticated','authenticated','rls-org-a@example.test','',now(),now(),now(),'{}','{"display_name":"Org A User"}'),
 ('00000000-0000-0000-0000-000000000004','11110000-0000-0000-0000-000000000004','authenticated','authenticated','rls-org-b@example.test','',now(),now(),now(),'{}','{"display_name":"Org B User"}');

insert into public.organizations(id,owner_user_id,name,organization_type,contact_email)
values
 ('22220000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003','RLS Org A','Test','a@example.test'),
 ('22220000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000004','RLS Org B','Test','b@example.test');
insert into public.organization_members(organization_id,user_id,member_role)
values
 ('22220000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003','owner'),
 ('22220000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000004','owner');
update public.profiles set role='organization' where id in ('11110000-0000-0000-0000-000000000003','11110000-0000-0000-0000-000000000004');

insert into public.personal_fields(user_id,field_key,value) values
 ('11110000-0000-0000-0000-000000000001','full_name','Person A private value'),
 ('11110000-0000-0000-0000-000000000001','email','Person A email value'),
 ('11110000-0000-0000-0000-000000000002','full_name','Person B private value');
insert into public.tap_cards(id,user_id,name,category) values
 ('77770000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','A card','networking');
insert into public.tap_card_fields(card_id,user_id,field_key,display_order)
values ('77770000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','full_name',0);
update public.profiles set default_tap_card_id='77770000-0000-0000-0000-000000000001'
where id='11110000-0000-0000-0000-000000000001';

insert into public.request_templates(id,organization_id,created_by,name,purpose,retention_days,retention_description)
values
 ('33330000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003','A event','RLS boundary test',30,'30 days'),
 ('33330000-0000-0000-0000-000000000002','22220000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000004','B event','RLS boundary test',30,'30 days');
insert into public.request_template_fields(template_id,field_key,required,display_order)
values ('33330000-0000-0000-0000-000000000001','full_name',true,0),('33330000-0000-0000-0000-000000000002','full_name',true,0);
insert into public.request_template_versions(id,template_id,organization_id,revision,name,description,purpose,retention_description,retention_days,created_by)
values
 ('44440000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000001',1,'A event v1','','RLS boundary test','30 days',30,'11110000-0000-0000-0000-000000000003'),
 ('44440000-0000-0000-0000-000000000002','33330000-0000-0000-0000-000000000002','22220000-0000-0000-0000-000000000002',1,'B event v1','','RLS boundary test','30 days',30,'11110000-0000-0000-0000-000000000004'),
 ('44440000-0000-0000-0000-000000000003','33330000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000001',2,'A event with required grade','','RLS boundary test','30 days',30,'11110000-0000-0000-0000-000000000003'),
 ('44440000-0000-0000-0000-000000000004','33330000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000001',3,'A event with optional grade','','RLS boundary test','30 days',30,'11110000-0000-0000-0000-000000000003');
insert into public.request_template_version_fields(version_id,field_key,required,display_order)
values ('44440000-0000-0000-0000-000000000001','full_name',true,0),('44440000-0000-0000-0000-000000000002','full_name',true,0);
insert into public.request_template_version_fields(version_id,field_key,required,display_order)
values ('44440000-0000-0000-0000-000000000003','full_name',true,0),('44440000-0000-0000-0000-000000000003','grade',true,1),
       ('44440000-0000-0000-0000-000000000004','full_name',true,0),('44440000-0000-0000-0000-000000000004','grade',false,1);
insert into public.request_template_version_questions(id,version_id,prompt,question_type,required,options,display_order,min_length,max_length,min_value,max_value)
values
 ('99990000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000001','Attendance','single_choice',true,'["On site","Remote"]',0,0,500,null,null),
 ('99990000-0000-0000-0000-000000000002','44440000-0000-0000-0000-000000000001','Short answer','short_text',false,'[]',1,2,5,null,null),
 ('99990000-0000-0000-0000-000000000003','44440000-0000-0000-0000-000000000001','Long answer','long_text',false,'[]',2,3,20,null,null),
 ('99990000-0000-0000-0000-000000000004','44440000-0000-0000-0000-000000000001','Will you attend?','yes_no',false,'[]',3,0,500,null,null),
 ('99990000-0000-0000-0000-000000000005','44440000-0000-0000-0000-000000000001','How many?','number',false,'[]',4,0,500,1,10),
 ('99990000-0000-0000-0000-000000000006','44440000-0000-0000-0000-000000000001','Event date','date',false,'[]',5,0,500,null,null),
 ('99990000-0000-0000-0000-000000000007','44440000-0000-0000-0000-000000000001','Sessions','multiple_choice',false,'["Red","Blue"]',6,0,500,null,null),
 ('99990000-0000-0000-0000-000000000008','44440000-0000-0000-0000-000000000002','Private question','short_text',false,'[]',0,0,500,null,null);
insert into public.organization_request_links(id,organization_id,template_id,template_version_id,created_by,token,token_hash,one_time,expires_at,created_at)
values
 ('aaaaaaaa-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003',repeat('c',64),encode(extensions.digest(repeat('c',64),'sha256'),'hex'),false,now()+interval '1 day',now()),
 ('aaaaaaaa-0000-0000-0000-000000000002','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003',repeat('d',64),encode(extensions.digest(repeat('d',64),'sha256'),'hex'),false,now()-interval '1 hour',now()-interval '2 hours'),
 ('aaaaaaaa-0000-0000-0000-000000000003','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003',repeat('e',64),encode(extensions.digest(repeat('e',64),'sha256'),'hex'),false,now()+interval '1 day',now()-interval '1 minute');
update public.organization_request_links set revoked_at=now() where id='aaaaaaaa-0000-0000-0000-000000000003';
insert into public.request_sessions(id,organization_id,template_id,template_version_id,created_by,status,nonce_hash,joined_user_id,expires_at,retention_days,joined_at,consumed_at,created_at)
values
 ('55550000-0000-0000-0000-000000000001','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003','approved',repeat('1',64),'11110000-0000-0000-0000-000000000001',now()+interval '10 minutes',30,now(),now(),now()),
 ('55550000-0000-0000-0000-000000000002','22220000-0000-0000-0000-000000000002','33330000-0000-0000-0000-000000000002','44440000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000004','approved',repeat('2',64),'11110000-0000-0000-0000-000000000002',now()+interval '10 minutes',30,now(),now(),now()),
 ('55550000-0000-0000-0000-000000000003','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003','awaiting_consent',repeat('3',64),'11110000-0000-0000-0000-000000000001',now()+interval '10 minutes',30,now(),null,now()),
 ('55550000-0000-0000-0000-000000000004','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000003','11110000-0000-0000-0000-000000000003','awaiting_consent',repeat('4',64),'11110000-0000-0000-0000-000000000002',now()+interval '10 minutes',30,now(),null,now()),
 ('55550000-0000-0000-0000-000000000005','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000003','11110000-0000-0000-0000-000000000003','awaiting_consent',repeat('5',64),'11110000-0000-0000-0000-000000000002',now()+interval '10 minutes',30,now(),null,now()),
 ('55550000-0000-0000-0000-000000000006','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000004','11110000-0000-0000-0000-000000000003','awaiting_consent',repeat('6',64),'11110000-0000-0000-0000-000000000002',now()+interval '10 minutes',30,now(),null,now());
insert into public.request_sessions(id,organization_id,template_id,template_version_id,created_by,status,nonce_hash,expires_at,retention_days,created_at)
values
 ('55550000-0000-0000-0000-000000000007','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003','created',repeat('7',64),now()+interval '10 minutes',30,now()),
 ('55550000-0000-0000-0000-000000000008','22220000-0000-0000-0000-000000000001','33330000-0000-0000-0000-000000000001','44440000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003','created',encode(extensions.digest(repeat('8',32),'sha256'),'hex'),now()-interval '1 minute',30,now()-interval '5 minutes');
insert into public.request_session_fields(session_id,field_key,required,display_order)
values ('55550000-0000-0000-0000-000000000001','full_name',true,0),('55550000-0000-0000-0000-000000000002','full_name',true,0),('55550000-0000-0000-0000-000000000003','full_name',true,0),
       ('55550000-0000-0000-0000-000000000004','full_name',true,0),('55550000-0000-0000-0000-000000000004','grade',true,1),
       ('55550000-0000-0000-0000-000000000005','full_name',true,0),('55550000-0000-0000-0000-000000000005','grade',true,1),
       ('55550000-0000-0000-0000-000000000006','full_name',true,0),('55550000-0000-0000-0000-000000000006','grade',false,1);
insert into public.request_responses(id,session_id,personal_user_id,status,approved_at,delete_after,answers,answer_count,shared_field_count)
values
 ('66660000-0000-0000-0000-000000000001','55550000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','approved',now(),now()+interval '30 days','{"99990000-0000-0000-0000-000000000001":"Remote"}',1,1),
 ('66660000-0000-0000-0000-000000000002','55550000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000002','approved',now(),now()+interval '30 days','{}',0,1);
insert into public.shared_values(response_id,field_key,value_snapshot)
values ('66660000-0000-0000-0000-000000000001','full_name','Person A approved snapshot'),('66660000-0000-0000-0000-000000000002','full_name','Person B approved snapshot');

insert into public.peer_share_links(id,card_id,owner_user_id,card_name_snapshot,token,token_hash,one_time,expires_at,used_at,reserved_exchange_id)
values
 ('88880000-0000-0000-0000-000000000001','77770000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','A card',repeat('a',64),encode(extensions.digest(repeat('a',64),'sha256'),'hex'),true,now()+interval '15 minutes',null,'aaaa0000-0000-0000-0000-000000000001'),
 ('88880000-0000-0000-0000-000000000002','77770000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','A card',repeat('b',64),encode(extensions.digest(repeat('b',64),'sha256'),'hex'),false,now()+interval '15 minutes',null,null);
insert into public.peer_share_links(id,card_id,owner_user_id,card_name_snapshot,token,token_hash,one_time,expires_at,revoked_at,created_at)
values
 ('88880000-0000-0000-0000-000000000003','77770000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','Expired card',repeat('d',64),encode(extensions.digest(repeat('d',64),'sha256'),'hex'),false,now()-interval '1 hour',null,now()-interval '2 hours'),
 ('88880000-0000-0000-0000-000000000004','77770000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','Revoked card',repeat('e',64),encode(extensions.digest(repeat('e',64),'sha256'),'hex'),false,now()+interval '1 day',now(),now());
insert into public.peer_exchange_sessions(id,link_id,sender_user_id,receiver_user_id,idempotency_key,nonce_hash,field_keys_snapshot,status,expires_at,created_at)
values ('aaaa0000-0000-0000-0000-000000000001','88880000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000002','bbbb0000-0000-0000-0000-000000000001',encode(extensions.digest('0123456789abcdef0123456789abcdef','sha256'),'hex'),array['full_name'],'pending',now()+interval '10 minutes',now());

-- Person B cannot access Person A's Vault, Tap Card, or default.
set local role authenticated;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is(public.update_my_display_name('  Person B shared  '),'Person B shared','a user can save a trimmed sharing name through the scoped RPC');
select is((select display_name from public.profiles where id='11110000-0000-0000-0000-000000000002'),'Person B shared','the sharing name is saved to the caller profile');
select throws_ok($$select public.update_my_display_name(repeat('x',101))$$,'22023','Sharing name must be 100 characters or fewer','the sharing name length is bounded on the server');
select is(public.update_my_display_name(''),'','a user can clear their sharing name to remain generic');
select throws_ok($$update public.profiles set display_name='Unauthorized' where id='11110000-0000-0000-0000-000000000001'$$,'42501','permission denied for table profiles','direct profile writes are blocked outside the scoped RPC');
select public.update_my_display_name('Person B');
select is((select count(*)::integer from public.personal_fields where user_id='11110000-0000-0000-0000-000000000001'),0,'Person B cannot read Person A Vault fields');
select is((select count(*)::integer from public.tap_cards where user_id='11110000-0000-0000-0000-000000000001'),0,'Person B cannot read Person A Tap Cards');
select throws_ok($$select public.save_tap_card('77770000-0000-0000-0000-000000000001','Changed','custom',array['full_name'],null)$$,'P0002','Tap Card not found','Person B cannot edit Person A Tap Card');
select throws_ok($$select public.set_default_tap_card('77770000-0000-0000-0000-000000000001')$$,'P0002','Tap Card not found or expired','Person B cannot set Person A as their default');
select throws_ok($$select public.join_card_share(repeat('d',64),'cccc0000-0000-0000-0000-000000000002')$$,'P0001','This Tap Card link has expired or is no longer available','expired Tap Card link cannot start an exchange');
select throws_ok($$select public.join_card_share(repeat('e',64),'cccc0000-0000-0000-0000-000000000003')$$,'P0001','This Tap Card link has expired or is no longer available','revoked Tap Card link cannot start an exchange');
select throws_ok($$select public.join_card_share(repeat('a',64),'cccc0000-0000-0000-0000-000000000004')$$,'23505','This one-time Tap Card is already being reviewed','one-time Tap Card reservation prevents a duplicate review');
select throws_ok($$select public.join_request_session('55550000-0000-0000-0000-000000000008',repeat('8',32))$$,'P0001','Request session expired','expired request session cannot be joined');

-- Organization A can read only its own approved submission and never the Vault.
reset role;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.personal_fields),0,'Organization members cannot directly query a user''s Vault');
select is((select count(*)::integer from public.request_responses),1,'Organization A can read its own submission');
select is((select count(*)::integer from public.request_responses where id='66660000-0000-0000-0000-000000000002'),0,'Organization A cannot read Organization B submission');
select is((select count(*)::integer from public.peer_transfers),0,'Organization members cannot read personal peer transfers');
select throws_ok($$select public.create_request_link('33330000-0000-0000-0000-000000000002',false,null)$$,'P0002','Template not found','Organization A cannot create links for Organization B templates');
select throws_ok($$select public.resolve_request_link(repeat('d',64))$$,'P0001','This request link has expired or was revoked','expired organization request link cannot start a session');
select throws_ok($$select public.resolve_request_link(repeat('e',64))$$,'P0001','This request link has expired or was revoked','revoked organization request link cannot start a session');
select is(public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote"}')::integer,1,'server accepts an allowed answer for the exact request version');
select is(public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote","99990000-0000-0000-0000-000000000002":"Hello","99990000-0000-0000-0000-000000000003":"Welcome to the event","99990000-0000-0000-0000-000000000004":true,"99990000-0000-0000-0000-000000000005":10,"99990000-0000-0000-0000-000000000006":"2026-09-30","99990000-0000-0000-0000-000000000007":["Red","Blue"]}')::integer,7,'server accepts valid answers for every supported question type');
select is(public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote","99990000-0000-0000-0000-000000000002":"  ","99990000-0000-0000-0000-000000000007":[]}')::integer,1,'optional whitespace and empty multiple-choice answers do not count as answers');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote","99990000-0000-0000-0000-000000000002":"H"}')$$,'23514','A text answer is outside the allowed length','server enforces short-text minimum length');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000099','{}')$$,'P0002','Request version not found','question validation does not expose another organization request');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote","99990000-0000-0000-0000-000000000003":"This answer exceeds twenty characters"}')$$,'23514','A text answer is outside the allowed length','server enforces long-text maximum length');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000008":"Answer"}')$$,'22023','An answer does not belong to this request version','server rejects question IDs from another request version');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote","99990000-0000-0000-0000-000000000004":"yes"}')$$,'23514','A yes/no answer must be selected','server enforces yes/no answer type');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote","99990000-0000-0000-0000-000000000005":10.1}')$$,'23514','A number answer is outside the allowed range','server enforces numeric bounds');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote","99990000-0000-0000-0000-000000000006":"2026-02-30"}')$$,'23514','A date answer is invalid','server rejects impossible calendar dates');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote","99990000-0000-0000-0000-000000000007":["Red","Red"]}')$$,'23514','A multiple-choice answer is not allowed','server rejects duplicate multiple-choice answers');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Remote","99990000-0000-0000-0000-000000000007":["Green"]}')$$,'23514','A multiple-choice answer is not allowed','server rejects choices outside the allowed list');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{"99990000-0000-0000-0000-000000000001":"Other"}')$$,'23514','A choice answer is not allowed','server rejects an answer outside the versioned choice list');
select throws_ok($$select public.validate_request_answers('44440000-0000-0000-0000-000000000001','{}')$$,'23514','A required question is unanswered','server rejects a missing required question');
select is(public.save_request_template('33330000-0000-0000-0000-000000000001','A revised event','Revised purpose',30::smallint,'[{"key":"grade","required":true}]','[]','Updated description')::text,'33330000-0000-0000-0000-000000000001','template edit creates a new immutable revision');
select ok(exists(select 1 from public.request_sessions s join public.request_session_fields f on f.session_id=s.id where s.id='55550000-0000-0000-0000-000000000001' and s.template_version_id='44440000-0000-0000-0000-000000000001' and f.field_key='full_name' and f.required) and not exists(select 1 from public.request_session_fields where session_id='55550000-0000-0000-0000-000000000001' and field_key='grade'),'active request remains pinned to its original field and question version');

-- Organization B cannot read Organization A submissions.
reset role;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.request_responses),1,'Organization B can read its own submission');
select is((select count(*)::integer from public.request_responses where id='66660000-0000-0000-0000-000000000001'),0,'Organization B cannot read Organization A submission');

-- The receiver sees only safe descriptors before consent; server resolution creates the snapshot.
reset role;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
insert into pg_temp.tapform_flow_payloads values ('peer_b',public.join_card_share(repeat('b',64),'cccc0000-0000-0000-0000-000000000001'));
select ok((select payload->'fields' is not null and not (payload ? 'values') from pg_temp.tapform_flow_payloads where flow_key='peer_b'),'peer join returns field descriptors and no personal values');
select throws_ok($$select public.respond_to_peer_exchange('aaaa0000-0000-0000-0000-000000000001','0123456789abcdef0123456789abcdef',null)$$,'22023','Consent decision is required','peer exchange rejects a missing consent decision');
select is(public.respond_to_peer_exchange('aaaa0000-0000-0000-0000-000000000001','0123456789abcdef0123456789abcdef',true)->>'status','completed','receiver consent completes a peer transfer');
select throws_ok($$select public.respond_to_peer_exchange('aaaa0000-0000-0000-0000-000000000001','0123456789abcdef0123456789abcdef',true)$$,'23505','This Tap Card exchange is invalid or already answered','completed one-time exchange rejects replay');
select is((select count(*)::integer from public.received_cards),1,'received-card access is limited to the receiver');
reset role;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.save_tap_card('77770000-0000-0000-0000-000000000001','A card','networking',array['email'],null)::text,'77770000-0000-0000-0000-000000000001','Tap Card owner edits the selection after peer review');
select public.update_my_display_name('Person A changed after review');
select ok((select display_name='Person A changed after review' from public.profiles where id='11110000-0000-0000-0000-000000000001')
  and (select sender_name_snapshot='Person A' from public.peer_exchange_sessions where id=(select (payload->>'exchangeId')::uuid from pg_temp.tapform_flow_payloads where flow_key='peer_b')),
  'pending exchange keeps the identity shown at review after the sender changes their profile');
reset role;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.respond_to_peer_exchange((select (payload->>'exchangeId')::uuid from pg_temp.tapform_flow_payloads where flow_key='peer_b'),(select payload->>'nonce' from pg_temp.tapform_flow_payloads where flow_key='peer_b'),true)->>'status','completed','reviewed Tap Card can finish after the owner edits its selection');
select ok((select t.values_snapshot ? 'full_name' and not (t.values_snapshot ? 'email') from public.peer_transfers t where t.exchange_id=(select (payload->>'exchangeId')::uuid from pg_temp.tapform_flow_payloads where flow_key='peer_b')),'peer approval transfers only the field keys shown at review time');
select is((select t.sender_name_snapshot || '|' || t.receiver_name_snapshot from public.peer_transfers t where t.exchange_id=(select (payload->>'exchangeId')::uuid from pg_temp.tapform_flow_payloads where flow_key='peer_b')),'Person A|Person B','peer receipt snapshots both exchange participants'' names');
insert into pg_temp.tapform_flow_payloads values ('request_b',public.resolve_request_link(repeat('c',64)));
select is(public.join_request_session((select (payload->>'requestSessionId')::uuid from pg_temp.tapform_flow_payloads where flow_key='request_b'),(select payload->>'nonce' from pg_temp.tapform_flow_payloads where flow_key='request_b'))->>'sessionId',(select payload->>'requestSessionId' from pg_temp.tapform_flow_payloads where flow_key='request_b'),'second participant joins the same reusable organization request');

reset role;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into pg_temp.tapform_flow_payloads values ('request_a',public.resolve_request_link(repeat('c',64)));
select ok(not ((select payload from pg_temp.tapform_flow_payloads where flow_key='request_a') ? 'values'),'request link resolution returns no Vault values');
select ok((select payload->>'templateVersionId'='44440000-0000-0000-0000-000000000001' and jsonb_array_length(payload->'questions')=7 from pg_temp.tapform_flow_payloads where flow_key='request_a'),'persistent request link keeps its saved template and question version');
select is(public.join_request_session((select (payload->>'requestSessionId')::uuid from pg_temp.tapform_flow_payloads where flow_key='request_a'),(select payload->>'nonce' from pg_temp.tapform_flow_payloads where flow_key='request_a'))->>'sessionId',(select payload->>'requestSessionId' from pg_temp.tapform_flow_payloads where flow_key='request_a'),'first participant joins the reusable organization request');
select is((select count(*)::integer from public.request_responses),1,'Person A can read only their own request receipt');
select throws_ok($$select public.respond_to_request('55550000-0000-0000-0000-000000000003',null,array['full_name'],'{"99990000-0000-0000-0000-000000000001":"Remote"}'::jsonb,'{}'::jsonb,array[]::text[])$$,'22023','Consent decision is required','organization request rejects a missing consent decision');
select is((select count(*)::integer from public.request_responses where id='66660000-0000-0000-0000-000000000002'),0,'Person A cannot read Person B request receipt');
select is((select count(*)::integer from public.peer_transfers where sender_user_id='11110000-0000-0000-0000-000000000001'),2,'sender can read both immutable peer receipts');
select is((select count(*)::integer from public.received_cards),0,'sender cannot read receiver-only saved-card state');
select is(public.respond_to_request('55550000-0000-0000-0000-000000000003',true,array['full_name'],'{"99990000-0000-0000-0000-000000000001":"Remote"}','{}','{}')->>'status','approved','complete an approved request with a Vault snapshot and separate answers');
select throws_ok($$select public.respond_to_request('55550000-0000-0000-0000-000000000003',true,array['full_name'],'{"99990000-0000-0000-0000-000000000001":"Remote"}','{}','{}')$$,'23505','Request has already been answered','duplicate request approval is rejected');
update public.personal_fields set value='Changed after approval' where user_id='11110000-0000-0000-0000-000000000001' and field_key='full_name';
select is((select sv.value_snapshot from public.shared_values sv join public.request_responses r on r.id=sv.response_id where r.session_id='55550000-0000-0000-0000-000000000003' and sv.field_key='full_name'),'Person A private value','historical request snapshot does not follow later Vault edits');
select ok((select r.answers='{"99990000-0000-0000-0000-000000000001":"Remote"}'::jsonb and not(r.answers ? 'full_name') and not exists(select 1 from public.shared_values sv where sv.response_id=r.id and sv.field_key like 'question:%') from public.request_responses r where r.session_id='55550000-0000-0000-0000-000000000003'),'One-Time answers remain separate from Vault fields');
reset role;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is((select count(distinct joined_user_id)::integer from public.request_sessions where request_link_id='aaaaaaaa-0000-0000-0000-000000000001' and joined_user_id in ('11110000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000002')),2,'persistent organization QR creates independent sessions for two people');
select ok((select payload->>'requestSessionId' from pg_temp.tapform_flow_payloads where flow_key='request_a')<>(select payload->>'requestSessionId' from pg_temp.tapform_flow_payloads where flow_key='request_b'),'persistent organization QR does not reuse participant state');

-- Smart completion requires required fields, permits optional exclusions, and saves only by explicit choice.
reset role;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.respond_to_request('55550000-0000-0000-0000-000000000004',true,array['full_name','grade'],'{}'::jsonb,'{}'::jsonb,'{}'::text[])$$,'23514','Required request details are missing','required missing Vault details block submission');
select is(public.respond_to_request('55550000-0000-0000-0000-000000000004',true,array['full_name','grade'],'{}'::jsonb,'{"grade":"Grade 8"}'::jsonb,'{}'::text[])->>'status','approved','request-only missing required detail completes the submission');
select is((select sv.value_snapshot from public.shared_values sv join public.request_responses r on r.id=sv.response_id where r.session_id='55550000-0000-0000-0000-000000000004' and sv.field_key='grade'),'Grade 8','request-only value is snapshotted for the organization');
select is((select count(*)::integer from public.personal_fields where user_id='11110000-0000-0000-0000-000000000002' and field_key='grade'),0,'request-only entry is not silently saved to the Vault');
select is(public.respond_to_request('55550000-0000-0000-0000-000000000006',true,array['full_name'],'{}'::jsonb,'{}'::jsonb,'{}'::text[])->>'status','approved','optional missing Vault detail may be skipped');
select is((select count(*)::integer from public.shared_values sv join public.request_responses r on r.id=sv.response_id where r.session_id='55550000-0000-0000-0000-000000000006' and sv.field_key='grade'),0,'skipped optional detail is not transferred');
select is(public.respond_to_request('55550000-0000-0000-0000-000000000005',true,array['full_name','grade'],'{}'::jsonb,'{"grade":"Grade 9"}'::jsonb,array['grade'])->>'status','approved','explicit save-to-Vault choice completes the request');
select is((select value from public.personal_fields where user_id='11110000-0000-0000-0000-000000000002' and field_key='grade'),'Grade 9','only explicitly selected missing data is stored in the Vault');
select is((select sv.value_snapshot from public.shared_values sv join public.request_responses r on r.id=sv.response_id where r.session_id='55550000-0000-0000-0000-000000000005' and sv.field_key='grade'),'Grade 9','explicitly saved value is included in its approved snapshot');
reset role;

-- Deletion is a backend operation and removes account-owned records.
reset role;
select set_config('request.jwt.claim.sub','11110000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"11110000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.export_my_data()->'vault'->>'full_name','Person B private value','export contains this account’s Vault and not another user’s');
select is((public.export_my_data()->'organizationRequests'->0->'shared')->>'full_name','Person B approved snapshot','export includes this account’s own request receipt');
select lives_ok('select public.delete_my_account()','authenticated account deletion executes in the backend');
reset role;
select is((select count(*)::integer from public.profiles where id='11110000-0000-0000-0000-000000000002'),0,'account deletion removes the profile and cascaded Vault records');

-- Verify the retention job is scheduled and deletes approved content while preserving receipt metadata.
select ok(exists(select 1 from cron.job where jobname='tapform-expiry-and-retention' and schedule='15 * * * *' and command='select public.purge_expired_shared_values()'),'retention cleanup is scheduled hourly');
update public.request_responses set delete_after=now()-interval '1 minute' where id='66660000-0000-0000-0000-000000000001';
set local role service_role;
select lives_ok('select public.purge_expired_shared_values()','service role can run retention cleanup');
reset role;
select ok(not exists(select 1 from public.shared_values where response_id='66660000-0000-0000-0000-000000000001'),'retention cleanup removes expired Vault snapshots');
select is((select answers from public.request_responses where id='66660000-0000-0000-0000-000000000001'),'{}'::jsonb,'retention cleanup removes expired One-Time answers');
select is((select shared_field_count::integer from public.request_responses where id='66660000-0000-0000-0000-000000000001'),1,'retention cleanup preserves non-sensitive receipt counts');

select * from finish();
rollback;
