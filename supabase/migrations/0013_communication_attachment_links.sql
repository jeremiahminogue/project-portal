-- Durable file links for RFI and submittal attachments.
-- The existing attachments_json columns remain as display snapshots/fallbacks.

create table if not exists rfi_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  rfi_id uuid not null references rfis(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  name text not null,
  size_label text not null default '',
  file_type text not null default 'file',
  path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  unique(rfi_id, file_id)
);

create table if not exists submittal_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  submittal_id uuid not null references submittals(id) on delete cascade,
  file_id uuid not null references files(id) on delete cascade,
  name text not null,
  size_label text not null default '',
  file_type text not null default 'file',
  path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  unique(submittal_id, file_id)
);

create index if not exists rfi_attachments_project_idx
  on rfi_attachments(project_id, rfi_id);

create index if not exists rfi_attachments_file_idx
  on rfi_attachments(file_id);

create index if not exists submittal_attachments_project_idx
  on submittal_attachments(project_id, submittal_id);

create index if not exists submittal_attachments_file_idx
  on submittal_attachments(file_id);

alter table rfi_attachments enable row level security;
alter table submittal_attachments enable row level security;

drop policy if exists "Users can view RFI attachments in projects they belong to" on rfi_attachments;
create policy "Users can view RFI attachments in projects they belong to"
  on rfi_attachments
  for select
  using (
    public.is_superadmin()
    or exists (
      select 1
      from project_members
      where project_members.project_id = rfi_attachments.project_id
        and project_members.user_id = auth.uid()
    )
  );

drop policy if exists "Project uploaders can insert RFI attachments" on rfi_attachments;
create policy "Project uploaders can insert RFI attachments"
  on rfi_attachments
  for insert
  with check (
    (
      public.is_superadmin()
      or exists (
        select 1
        from project_members
        where project_members.project_id = rfi_attachments.project_id
          and project_members.user_id = auth.uid()
          and project_members.role in ('admin', 'member')
      )
    )
    and exists (
      select 1
      from files
      where files.id = rfi_attachments.file_id
        and files.project_id = rfi_attachments.project_id
        and files.is_folder = false
    )
  );

drop policy if exists "Project uploaders can update RFI attachments" on rfi_attachments;
create policy "Project uploaders can update RFI attachments"
  on rfi_attachments
  for update
  using (
    public.is_superadmin()
    or exists (
      select 1
      from project_members
      where project_members.project_id = rfi_attachments.project_id
        and project_members.user_id = auth.uid()
        and project_members.role in ('admin', 'member')
    )
  )
  with check (
    exists (
      select 1
      from files
      where files.id = rfi_attachments.file_id
        and files.project_id = rfi_attachments.project_id
        and files.is_folder = false
    )
  );

drop policy if exists "Project uploaders can delete RFI attachments" on rfi_attachments;
create policy "Project uploaders can delete RFI attachments"
  on rfi_attachments
  for delete
  using (
    public.is_superadmin()
    or exists (
      select 1
      from project_members
      where project_members.project_id = rfi_attachments.project_id
        and project_members.user_id = auth.uid()
        and project_members.role in ('admin', 'member')
    )
  );

drop policy if exists "Users can view submittal attachments in projects they belong to" on submittal_attachments;
create policy "Users can view submittal attachments in projects they belong to"
  on submittal_attachments
  for select
  using (
    public.is_superadmin()
    or exists (
      select 1
      from project_members
      where project_members.project_id = submittal_attachments.project_id
        and project_members.user_id = auth.uid()
    )
  );

drop policy if exists "Project uploaders can insert submittal attachments" on submittal_attachments;
create policy "Project uploaders can insert submittal attachments"
  on submittal_attachments
  for insert
  with check (
    (
      public.is_superadmin()
      or exists (
        select 1
        from project_members
        where project_members.project_id = submittal_attachments.project_id
          and project_members.user_id = auth.uid()
          and project_members.role in ('admin', 'member')
      )
    )
    and exists (
      select 1
      from files
      where files.id = submittal_attachments.file_id
        and files.project_id = submittal_attachments.project_id
        and files.is_folder = false
    )
  );

drop policy if exists "Project uploaders can update submittal attachments" on submittal_attachments;
create policy "Project uploaders can update submittal attachments"
  on submittal_attachments
  for update
  using (
    public.is_superadmin()
    or exists (
      select 1
      from project_members
      where project_members.project_id = submittal_attachments.project_id
        and project_members.user_id = auth.uid()
        and project_members.role in ('admin', 'member')
    )
  )
  with check (
    exists (
      select 1
      from files
      where files.id = submittal_attachments.file_id
        and files.project_id = submittal_attachments.project_id
        and files.is_folder = false
    )
  );

drop policy if exists "Project uploaders can delete submittal attachments" on submittal_attachments;
create policy "Project uploaders can delete submittal attachments"
  on submittal_attachments
  for delete
  using (
    public.is_superadmin()
    or exists (
      select 1
      from project_members
      where project_members.project_id = submittal_attachments.project_id
        and project_members.user_id = auth.uid()
        and project_members.role in ('admin', 'member')
    )
  );
