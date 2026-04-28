-- Saved PDF markup layers.
-- Originals stay untouched; annotations are stored separately and reapplied in the viewer.

create table if not exists file_markups (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  page_number integer not null default 0,
  annotations_json jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(file_id, page_number)
);

alter table file_markups add column if not exists page_number integer not null default 0;
alter table file_markups drop constraint if exists file_markups_file_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'file_markups_file_id_page_number_key'
  ) then
    alter table file_markups add constraint file_markups_file_id_page_number_key unique(file_id, page_number);
  end if;
end $$;

drop trigger if exists file_markups_updated_at on file_markups;
create trigger file_markups_updated_at before update on file_markups
  for each row execute function update_updated_at_column();

create index if not exists file_markups_project_id_idx on file_markups(project_id);
create index if not exists file_markups_file_id_idx on file_markups(file_id);

alter table file_markups enable row level security;

create policy "Users can view file markups in projects they belong to"
  on file_markups for select using (
    exists (
      select 1 from project_members
      where project_id = file_markups.project_id and user_id = auth.uid()
    )
  );

create policy "Project members can insert file markups"
  on file_markups for insert with check (
    exists (
      select 1 from project_members
      where project_id = file_markups.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

create policy "Project members can update file markups"
  on file_markups for update using (
    exists (
      select 1 from project_members
      where project_id = file_markups.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

create policy "Project admins can delete file markups"
  on file_markups for delete using (
    exists (
      select 1 from project_members
      where project_id = file_markups.project_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "superadmin bypass select" on file_markups for select using (public.is_superadmin());
create policy "superadmin bypass insert" on file_markups for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on file_markups for update using (public.is_superadmin());
create policy "superadmin bypass delete" on file_markups for delete using (public.is_superadmin());
