-- Cross-app completion pass for project workflows.
-- Adds the lightweight production tables/columns needed for RFI distribution,
-- submittal routing detail, update engagement, directory contacts, chat reads,
-- schedule management, share links, and notification retry operations.

alter table schedule_activities
  add column if not exists activity_type text not null default 'internal',
  add column if not exists predecessor_id uuid references schedule_activities(id) on delete set null,
  add column if not exists percent_complete integer not null default 0 check (percent_complete between 0 and 100);

drop policy if exists "Project members can update schedule activities" on schedule_activities;
create policy "Project members can update schedule activities"
  on schedule_activities for update using (
    exists (
      select 1 from project_members
      where project_id = schedule_activities.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

drop policy if exists "Project admins can delete schedule activities" on schedule_activities;
create policy "Project admins can delete schedule activities"
  on schedule_activities for delete using (
    exists (
      select 1 from project_members
      where project_id = schedule_activities.project_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

alter table rfis
  add column if not exists distribution_json jsonb not null default '[]'::jsonb,
  add column if not exists activity_json jsonb not null default '[]'::jsonb;

create unique index if not exists rfis_project_number_unique_idx
  on rfis(project_id, lower(number));

alter table submittals
  add column if not exists revision integer not null default 0,
  add column if not exists submit_by date,
  add column if not exists received_from uuid references auth.users(id) on delete set null;

alter table submittal_routing_steps
  add column if not exists due_date date,
  add column if not exists response text,
  add column if not exists required boolean not null default true,
  add column if not exists completed_by uuid references auth.users(id) on delete set null;

drop policy if exists "Project members can insert routing steps" on submittal_routing_steps;
create policy "Project members can insert routing steps"
  on submittal_routing_steps for insert with check (
    exists (
      select 1 from submittals s
      join project_members pm on pm.project_id = s.project_id
      where s.id = submittal_routing_steps.submittal_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'member')
    )
  );

create table if not exists update_comments (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references updates(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

drop trigger if exists update_comments_updated_at on update_comments;
create trigger update_comments_updated_at before update on update_comments
  for each row execute function update_updated_at_column();

create index if not exists update_comments_update_id_created_idx
  on update_comments(update_id, created_at);

alter table update_comments enable row level security;

drop policy if exists "Users can view update comments in projects they belong to" on update_comments;
create policy "Users can view update comments in projects they belong to"
  on update_comments for select using (
    exists (
      select 1
      from updates u
      join project_members pm on pm.project_id = u.project_id
      where u.id = update_comments.update_id
        and pm.user_id = auth.uid()
    )
  );

drop policy if exists "Project collaborators can insert update comments" on update_comments;
create policy "Project collaborators can insert update comments"
  on update_comments for insert with check (
    exists (
      select 1
      from updates u
      join project_members pm on pm.project_id = u.project_id
      where u.id = update_comments.update_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'member', 'guest')
    )
  );

drop policy if exists "Comment authors and admins can update comments" on update_comments;
create policy "Comment authors and admins can update comments"
  on update_comments for update using (
    author_id = auth.uid()
    or exists (
      select 1
      from updates u
      join project_members pm on pm.project_id = u.project_id
      where u.id = update_comments.update_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

drop policy if exists "Comment authors and admins can delete comments" on update_comments;
create policy "Comment authors and admins can delete comments"
  on update_comments for delete using (
    author_id = auth.uid()
    or exists (
      select 1
      from updates u
      join project_members pm on pm.project_id = u.project_id
      where u.id = update_comments.update_id
        and pm.user_id = auth.uid()
        and pm.role = 'admin'
    )
  );

create table if not exists update_likes (
  update_id uuid not null references updates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (update_id, user_id)
);

alter table update_likes enable row level security;

drop policy if exists "Users can view update likes in projects they belong to" on update_likes;
create policy "Users can view update likes in projects they belong to"
  on update_likes for select using (
    exists (
      select 1
      from updates u
      join project_members pm on pm.project_id = u.project_id
      where u.id = update_likes.update_id
        and pm.user_id = auth.uid()
    )
  );

drop policy if exists "Project collaborators can manage their update likes" on update_likes;
create policy "Project collaborators can manage their update likes"
  on update_likes for all using (
    user_id = auth.uid()
    and exists (
      select 1
      from updates u
      join project_members pm on pm.project_id = u.project_id
      where u.id = update_likes.update_id
        and pm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from updates u
      join project_members pm on pm.project_id = u.project_id
      where u.id = update_likes.update_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'member', 'guest', 'readonly')
    )
  );

create table if not exists project_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  role text,
  organization text,
  email text,
  phone text,
  contact_type text not null default 'external',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

drop trigger if exists project_contacts_updated_at on project_contacts;
create trigger project_contacts_updated_at before update on project_contacts
  for each row execute function update_updated_at_column();

create index if not exists project_contacts_project_id_idx on project_contacts(project_id);

alter table project_contacts enable row level security;

drop policy if exists "Users can view project contacts for projects they belong to" on project_contacts;
create policy "Users can view project contacts for projects they belong to"
  on project_contacts for select using (
    exists (
      select 1 from project_members
      where project_id = project_contacts.project_id and user_id = auth.uid()
    )
  );

drop policy if exists "Project members can insert project contacts" on project_contacts;
create policy "Project members can insert project contacts"
  on project_contacts for insert with check (
    exists (
      select 1 from project_members
      where project_id = project_contacts.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

drop policy if exists "Project members can update project contacts" on project_contacts;
create policy "Project members can update project contacts"
  on project_contacts for update using (
    exists (
      select 1 from project_members
      where project_id = project_contacts.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

drop policy if exists "Project admins can delete project contacts" on project_contacts;
create policy "Project admins can delete project contacts"
  on project_contacts for delete using (
    exists (
      select 1 from project_members
      where project_id = project_contacts.project_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

alter table chat_messages
  add column if not exists attachments_json jsonb not null default '[]'::jsonb;

create table if not exists chat_message_reads (
  subject_id uuid not null references chat_subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamp with time zone not null default now(),
  primary key (subject_id, user_id)
);

alter table chat_message_reads enable row level security;

drop policy if exists "Users can manage their chat read state" on chat_message_reads;
create policy "Users can manage their chat read state"
  on chat_message_reads for all using (
    user_id = auth.uid()
    and exists (
      select 1
      from chat_subjects cs
      join project_members pm on pm.project_id = cs.project_id
      where cs.id = chat_message_reads.subject_id
        and pm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from chat_subjects cs
      join project_members pm on pm.project_id = cs.project_id
      where cs.id = chat_message_reads.subject_id
        and pm.user_id = auth.uid()
    )
  );

alter table notification_deliveries
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_retry_at timestamp with time zone;

create index if not exists notification_deliveries_retry_idx
  on notification_deliveries(status, retry_count, created_at);

drop policy if exists "superadmin bypass select" on update_comments;
drop policy if exists "superadmin bypass insert" on update_comments;
drop policy if exists "superadmin bypass update" on update_comments;
drop policy if exists "superadmin bypass delete" on update_comments;
create policy "superadmin bypass select" on update_comments for select using (public.is_superadmin());
create policy "superadmin bypass insert" on update_comments for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on update_comments for update using (public.is_superadmin());
create policy "superadmin bypass delete" on update_comments for delete using (public.is_superadmin());

drop policy if exists "superadmin bypass select" on update_likes;
drop policy if exists "superadmin bypass insert" on update_likes;
drop policy if exists "superadmin bypass update" on update_likes;
drop policy if exists "superadmin bypass delete" on update_likes;
create policy "superadmin bypass select" on update_likes for select using (public.is_superadmin());
create policy "superadmin bypass insert" on update_likes for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on update_likes for update using (public.is_superadmin());
create policy "superadmin bypass delete" on update_likes for delete using (public.is_superadmin());

drop policy if exists "superadmin bypass select" on project_contacts;
drop policy if exists "superadmin bypass insert" on project_contacts;
drop policy if exists "superadmin bypass update" on project_contacts;
drop policy if exists "superadmin bypass delete" on project_contacts;
create policy "superadmin bypass select" on project_contacts for select using (public.is_superadmin());
create policy "superadmin bypass insert" on project_contacts for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on project_contacts for update using (public.is_superadmin());
create policy "superadmin bypass delete" on project_contacts for delete using (public.is_superadmin());

drop policy if exists "superadmin bypass select" on chat_message_reads;
drop policy if exists "superadmin bypass insert" on chat_message_reads;
drop policy if exists "superadmin bypass update" on chat_message_reads;
drop policy if exists "superadmin bypass delete" on chat_message_reads;
create policy "superadmin bypass select" on chat_message_reads for select using (public.is_superadmin());
create policy "superadmin bypass insert" on chat_message_reads for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on chat_message_reads for update using (public.is_superadmin());
create policy "superadmin bypass delete" on chat_message_reads for delete using (public.is_superadmin());
