-- Project Portal v1 – Seed Data
-- Note: This seed assumes auth.users rows are already created via magic-link signup.
-- In production, users sign up via `supabase auth sign-up` or via the magic-link UI.
-- This seed only inserts profile records and project/content data.

begin;

-- Insert test profile rows
-- Note: These should reference existing auth.users rows in a real deployment.
-- For development, you can manually create these auth users via Supabase dashboard
-- or extend this seed to call auth.users() API (not supported in SQL seed).

insert into profiles (id, full_name, email, role, company, title, avatar_url)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Jeremiah Minogue', 'jeremiah@puebloelectrics.com', 'admin', 'Pueblo Electric', 'Project Manager', null),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Tiffany Chen', 'tiffany@puebloelectrics.com', 'member', 'Pueblo Electric', 'Field Inspector', null),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Michele Gutierrez', 'michele@example.com', 'guest', 'CSF #1646 Owner', 'Facility Manager', null);

-- Insert one project: CSF Fire Alarm #1646
insert into projects (id, slug, name, customer, customer_rep, address, phase, percent_complete, next_milestone, next_milestone_date)
values
  (
    '99999999-9999-9999-9999-999999999999'::uuid,
    'csf-1646',
    'CSF Fire Alarm System Retrofit',
    'CSF #1646 - Facilities',
    'Michele Gutierrez',
    '1234 Main St, Pueblo, CO 81001',
    'construction',
    45,
    'System testing and punch-list',
    '2026-05-10'
  );

-- Add project members
insert into project_members (id, project_id, user_id, role, invited_at, accepted_at)
values
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'admin', now(), now()),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'member', now(), now()),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'guest', now(), now());

-- Insert schedule activities (dates starting 2026-04-22 onward)
insert into schedule_activities (id, project_id, phase, title, start_date, end_date, owner, status, is_blackout)
values
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'Rough-In', 'Conduit and cable routing', '2026-04-22'::date, '2026-05-06'::date, 'Tiffany Chen', 'green', false),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'Rough-In', 'Panel installation', '2026-05-07'::date, '2026-05-13'::date, 'Tiffany Chen', 'amber', false),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'Testing', 'System functional testing', '2026-05-14'::date, '2026-05-20'::date, 'Jeremiah Minogue', 'blue', false),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'Closeout', 'Punch list completion', '2026-05-21'::date, '2026-06-03'::date, 'Michele Gutierrez', 'gray', false);

-- Insert submittals
insert into submittals (id, project_id, number, title, spec_section, submitted_date, due_date, owner, status, current_step, notes)
values
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'S-001', 'Fire Alarm Control Panel Specs', '16730', '2026-04-15'::date, '2026-04-25'::date, '11111111-1111-1111-1111-111111111111'::uuid, 'approved', 2, 'Approved by AHJ on 2026-04-20'),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'S-002', 'Addressable Detector Schedule', '16840', '2026-04-18'::date, '2026-04-28'::date, '22222222-2222-2222-2222-222222222222'::uuid, 'in_review', 1, 'Pending owner review'),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'S-003', 'Cable and Conduit Layout', '16050', '2026-04-21'::date, '2026-05-05'::date, '22222222-2222-2222-2222-222222222222'::uuid, 'submitted', 0, 'Just submitted for initial review');

-- Insert RFIs
insert into rfis (id, project_id, number, title, question, opened_date, due_date, assigned_to, assigned_org, status, answer)
values
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'RFI-001', 'Panel Location Clarification', 'Can the main panel be relocated 10 feet west per site constraints?', '2026-04-20'::date, '2026-04-27'::date, '33333333-3333-3333-3333-333333333333'::uuid, 'CSF #1646 Owner', 'answered', 'Yes, relocation is acceptable. Updated drawings submitted.'),
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'RFI-002', 'Detector Model Substitution', 'Is the Hochiki AL-100 an acceptable substitute for the specified Apollo detector?', '2026-04-21'::date, '2026-04-30'::date, '33333333-3333-3333-3333-333333333333'::uuid, 'CSF #1646 Owner', 'open', null);

-- Insert one chat subject with messages
insert into chat_subjects (id, project_id, title, created_by, created_at, last_message_at)
values
  (gen_random_uuid(), '99999999-9999-9999-9999-999999999999'::uuid, 'Panel Installation Timeline', '11111111-1111-1111-1111-111111111111'::uuid, now() - interval '2 days', now() - interval '1 hour');

-- Insert chat messages for that subject (we need the subject id, so we'll do this in a nested query)
insert into chat_messages (id, subject_id, author_id, body, created_at)
select
  gen_random_uuid(),
  id,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'We are on schedule to begin rough-in work on April 22. Conduit routing will take approximately two weeks.',
  now() - interval '2 days'
from chat_subjects
where title = 'Panel Installation Timeline'
union all
select
  gen_random_uuid(),
  id,
  '33333333-3333-3333-3333-333333333333'::uuid,
  'Excellent. Please coordinate with facilities to ensure site access and any electrical shutdowns are scheduled in advance.',
  now() - interval '1 hour'
from chat_subjects
where title = 'Panel Installation Timeline';

-- Insert one update post
insert into updates (id, project_id, author_id, title, body, kind, published_at)
values
  (
    gen_random_uuid(),
    '99999999-9999-9999-9999-999999999999'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Week of April 21 Progress Update',
    'Rough-in work on the fire alarm system is progressing on schedule. The main control panel location has been finalized, and conduit routing is underway. All submittals are on track for approval by the due dates.',
    'weekly',
    now() - interval '6 hours'
  );

commit;
