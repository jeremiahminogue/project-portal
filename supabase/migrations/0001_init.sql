-- # Project Portal v1 – Initial Schema
-- Single-tenant (Pueblo Electric). org_id = 1 implicit.
-- To retrofit for multi-tenant later:
-- 1. Add an `orgs` table with id PK
-- 2. Change all `org_id = 1` defaults to foreign keys
-- 3. Add one RLS predicate per table: `exists (select 1 from orgs where id = ... and org_id = auth.org_id())`
-- 4. No other schema changes needed.

create extension if not exists pgcrypto;

-- Updated-at trigger function (declared up front so the triggers below can
-- reference it). Using CREATE OR REPLACE so re-runs are safe.
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Enums
create type project_phase as enum ('pre_con', 'design', 'construction', 'closeout');
create type member_role as enum ('admin', 'member', 'guest', 'readonly');
create type submittal_status as enum ('draft', 'submitted', 'in_review', 'approved', 'revise_resubmit', 'rejected');
create type rfi_status as enum ('open', 'answered', 'closed');
create type update_kind as enum ('oac_recap', 'weekly', 'phase_kickoff', 'safety', 'general');

-- Profiles: extends auth.users with PE-specific fields
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null unique,
  role member_role not null default 'member',
  company text,
  title text,
  avatar_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger profiles_updated_at before update on profiles
  for each row execute function update_updated_at_column();

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select using (id = auth.uid());

create policy "Users can update their own profile"
  on profiles for update using (id = auth.uid());

-- Projects: one per PE undertaking
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  customer text not null,
  customer_rep text,
  address text,
  phase project_phase not null default 'pre_con',
  percent_complete integer default 0,
  next_milestone text,
  next_milestone_date date,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger projects_updated_at before update on projects
  for each row execute function update_updated_at_column();

create index projects_slug_idx on projects(slug);

alter table projects enable row level security;

-- NOTE: the "Users can view projects they are members of" policy is defined
-- AFTER project_members is created below, to avoid a forward-reference error.

-- Project members: RLS enforcement via project_members
create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'member',
  invited_at timestamp with time zone default now(),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(project_id, user_id)
);

create trigger project_members_updated_at before update on project_members
  for each row execute function update_updated_at_column();

create index project_members_project_id_idx on project_members(project_id);
create index project_members_user_id_idx on project_members(user_id);

alter table project_members enable row level security;

create policy "Users can view project members for projects they belong to"
  on project_members for select using (
    exists (
      select 1 from project_members pm2
      where pm2.project_id = project_members.project_id and pm2.user_id = auth.uid()
    )
  );

create policy "Project admins can insert project members"
  on project_members for insert with check (
    exists (
      select 1 from project_members pm2
      where pm2.project_id = project_members.project_id
        and pm2.user_id = auth.uid()
        and pm2.role = 'admin'
    )
  );

create policy "Project admins can update project members"
  on project_members for update using (
    exists (
      select 1 from project_members pm2
      where pm2.project_id = project_members.project_id
        and pm2.user_id = auth.uid()
        and pm2.role = 'admin'
    )
  );

-- Projects SELECT policy (moved here so project_members exists)
create policy "Users can view projects they are members of"
  on projects for select using (
    exists (
      select 1 from project_members
      where project_id = projects.id and user_id = auth.uid()
    )
  );

-- Files: nested folder tree, stored in R2 via storage_key
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  parent_folder_id uuid references files(id) on delete cascade,
  name text not null,
  is_folder boolean not null default false,
  storage_key text,
  size_bytes integer,
  mime_type text,
  version integer default 1,
  uploaded_by uuid references auth.users(id) on delete set null,
  tags text[] default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger files_updated_at before update on files
  for each row execute function update_updated_at_column();

create index files_project_id_idx on files(project_id);
create index files_project_id_parent_folder_id_idx on files(project_id, parent_folder_id);

alter table files enable row level security;

create policy "Users can view files in projects they belong to"
  on files for select using (
    exists (
      select 1 from project_members
      where project_id = files.project_id and user_id = auth.uid()
    )
  );

create policy "Project members can insert files"
  on files for insert with check (
    exists (
      select 1 from project_members
      where project_id = files.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

create policy "Project members can update files"
  on files for update using (
    exists (
      select 1 from project_members
      where project_id = files.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

create policy "Project admins can delete files"
  on files for delete using (
    exists (
      select 1 from project_members
      where project_id = files.project_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

-- Schedule activities: from MS Project paste
create table if not exists schedule_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  phase text not null,
  title text not null,
  start_date date not null,
  end_date date not null,
  owner text,
  status text not null default 'blue',
  is_blackout boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger schedule_activities_updated_at before update on schedule_activities
  for each row execute function update_updated_at_column();

create index schedule_activities_project_id_idx on schedule_activities(project_id);
create index schedule_activities_project_id_start_date_idx on schedule_activities(project_id, start_date);

alter table schedule_activities enable row level security;

create policy "Users can view schedule activities for projects they belong to"
  on schedule_activities for select using (
    exists (
      select 1 from project_members
      where project_id = schedule_activities.project_id and user_id = auth.uid()
    )
  );

create policy "Project members can insert schedule activities"
  on schedule_activities for insert with check (
    exists (
      select 1 from project_members
      where project_id = schedule_activities.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

-- Submittals: classic routing workflow
create table if not exists submittals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number text not null,
  title text not null,
  spec_section text,
  submitted_date date,
  due_date date,
  owner uuid references auth.users(id) on delete set null,
  status submittal_status not null default 'draft',
  current_step integer default 0,
  decision text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger submittals_updated_at before update on submittals
  for each row execute function update_updated_at_column();

create index submittals_project_id_idx on submittals(project_id);
create index submittals_project_id_status_idx on submittals(project_id, status);

alter table submittals enable row level security;

create policy "Users can view submittals in projects they belong to"
  on submittals for select using (
    exists (
      select 1 from project_members
      where project_id = submittals.project_id and user_id = auth.uid()
    )
  );

create policy "Project members can insert submittals"
  on submittals for insert with check (
    exists (
      select 1 from project_members
      where project_id = submittals.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

create policy "Project members can update submittals"
  on submittals for update using (
    exists (
      select 1 from project_members
      where project_id = submittals.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member', 'guest')
    )
  );

create policy "Project admins can delete submittals"
  on submittals for delete using (
    exists (
      select 1 from project_members
      where project_id = submittals.project_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

-- Submittal routing steps: handoff chain
create table if not exists submittal_routing_steps (
  id uuid primary key default gen_random_uuid(),
  submittal_id uuid not null references submittals(id) on delete cascade,
  step_order integer not null,
  assignee uuid references auth.users(id) on delete set null,
  role member_role,
  status submittal_status,
  signed_off_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger submittal_routing_steps_updated_at before update on submittal_routing_steps
  for each row execute function update_updated_at_column();

create index submittal_routing_steps_submittal_id_idx on submittal_routing_steps(submittal_id);

alter table submittal_routing_steps enable row level security;

create policy "Users can view routing steps for submittals in projects they belong to"
  on submittal_routing_steps for select using (
    exists (
      select 1 from submittals s
      join project_members pm on pm.project_id = s.project_id
      where s.id = submittal_routing_steps.submittal_id and pm.user_id = auth.uid()
    )
  );

create policy "Project members can update routing steps"
  on submittal_routing_steps for update using (
    exists (
      select 1 from submittals s
      join project_members pm on pm.project_id = s.project_id
      where s.id = submittal_routing_steps.submittal_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'member', 'guest')
    )
  );

-- RFIs: similar to submittals but with distinct workflow
create table if not exists rfis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  number text not null,
  title text not null,
  question text,
  opened_date date,
  due_date date,
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_org text,
  status rfi_status not null default 'open',
  answer text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger rfis_updated_at before update on rfis
  for each row execute function update_updated_at_column();

create index rfis_project_id_idx on rfis(project_id);
create index rfis_project_id_status_idx on rfis(project_id, status);

alter table rfis enable row level security;

create policy "Users can view RFIs in projects they belong to"
  on rfis for select using (
    exists (
      select 1 from project_members
      where project_id = rfis.project_id and user_id = auth.uid()
    )
  );

create policy "Project members can insert RFIs"
  on rfis for insert with check (
    exists (
      select 1 from project_members
      where project_id = rfis.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

create policy "Project members can update RFIs"
  on rfis for update using (
    exists (
      select 1 from project_members
      where project_id = rfis.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member', 'guest')
    )
  );

-- Chat subjects: thread per discussion area
create table if not exists chat_subjects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  created_at timestamp with time zone default now(),
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamp with time zone,
  updated_at timestamp with time zone default now()
);

create trigger chat_subjects_updated_at before update on chat_subjects
  for each row execute function update_updated_at_column();

create index chat_subjects_project_id_idx on chat_subjects(project_id);
create index chat_subjects_project_id_last_message_at_idx on chat_subjects(project_id, last_message_at desc);

alter table chat_subjects enable row level security;

create policy "Users can view chat subjects in projects they belong to"
  on chat_subjects for select using (
    exists (
      select 1 from project_members
      where project_id = chat_subjects.project_id and user_id = auth.uid()
    )
  );

create policy "Project members can insert chat subjects"
  on chat_subjects for insert with check (
    exists (
      select 1 from project_members
      where project_id = chat_subjects.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member', 'guest')
    )
  );

-- Chat messages: belong to a subject
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references chat_subjects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete set null,
  body text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger chat_messages_updated_at before update on chat_messages
  for each row execute function update_updated_at_column();

create index chat_messages_subject_id_idx on chat_messages(subject_id);
create index chat_messages_subject_id_created_at_idx on chat_messages(subject_id, created_at desc);

alter table chat_messages enable row level security;

create policy "Users can view chat messages in subjects in projects they belong to"
  on chat_messages for select using (
    exists (
      select 1 from chat_subjects cs
      join project_members pm on pm.project_id = cs.project_id
      where cs.id = chat_messages.subject_id and pm.user_id = auth.uid()
    )
  );

create policy "Project members and guests can insert chat messages"
  on chat_messages for insert with check (
    exists (
      select 1 from chat_subjects cs
      join project_members pm on pm.project_id = cs.project_id
      where cs.id = chat_messages.subject_id
        and pm.user_id = auth.uid()
        and pm.role in ('admin', 'member', 'guest')
    )
  );

-- Updates: PM-authored posts (OAC recap, weekly, phase kickoff, safety)
create table if not exists updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  title text not null,
  body text,
  kind update_kind not null default 'general',
  attachments_json jsonb default '{}'::jsonb,
  published_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger updates_updated_at before update on updates
  for each row execute function update_updated_at_column();

create index updates_project_id_idx on updates(project_id);
create index updates_project_id_published_at_idx on updates(project_id, published_at desc);

alter table updates enable row level security;

create policy "Users can view updates in projects they belong to"
  on updates for select using (
    exists (
      select 1 from project_members
      where project_id = updates.project_id and user_id = auth.uid()
    )
  );

create policy "Project members can insert updates"
  on updates for insert with check (
    exists (
      select 1 from project_members
      where project_id = updates.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

create policy "Project admins can update updates"
  on updates for update using (
    exists (
      select 1 from project_members
      where project_id = updates.project_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

-- Share tokens: bypass RLS, served via public API routes with token validation
create table if not exists share_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  resource_type text not null,
  resource_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamp with time zone,
  view_count integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create trigger share_tokens_updated_at before update on share_tokens
  for each row execute function update_updated_at_column();

create index share_tokens_token_idx on share_tokens(token);
create index share_tokens_resource_type_resource_id_idx on share_tokens(resource_type, resource_id);

alter table share_tokens enable row level security;

create policy "Users can view share tokens they created"
  on share_tokens for select using (created_by = auth.uid());

create policy "Project admins can create share tokens"
  on share_tokens for insert with check (
    case
      when resource_type = 'file' then
        exists (
          select 1 from files f
          join project_members pm on pm.project_id = f.project_id
          where f.id = resource_id and pm.user_id = auth.uid() and pm.role = 'admin'
        )
      when resource_type = 'update' then
        exists (
          select 1 from updates u
          join project_members pm on pm.project_id = u.project_id
          where u.id = resource_id and pm.user_id = auth.uid() and pm.role = 'admin'
        )
      else false
    end
  );

-- (update_updated_at_column() is defined at the top of this file.)
