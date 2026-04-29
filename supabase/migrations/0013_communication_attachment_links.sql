-- Durable file links for RFI and submittal attachments.
-- The existing attachments_json columns remain as fast display snapshots, but
-- these tables make the database relationship explicit and backfillable.

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

create index if not exists rfi_attachments_project_idx on rfi_attachments(project_id, rfi_id);
create index if not exists rfi_attachments_file_idx on rfi_attachments(file_id);
create index if not exists submittal_attachments_project_idx on submittal_attachments(project_id, submittal_id);
create index if not exists submittal_attachments_file_idx on submittal_attachments(file_id);

alter table rfi_attachments enable row level security;
alter table submittal_attachments enable row level security;

drop policy if exists "Users can view RFI attachments in projects they belong to" on rfi_attachments;
create policy "Users can view RFI attachments in projects they belong to"
  on rfi_attachments for select using (
    public.is_superadmin()
    or exists (
      select 1 from project_members
      where project_id = rfi_attachments.project_id
        and user_id = auth.uid()
    )
  );

drop policy if exists "Project uploaders can manage RFI attachments" on rfi_attachments;
create policy "Project uploaders can manage RFI attachments"
  on rfi_attachments for all using (
    public.is_superadmin()
    or exists (
      select 1 from project_members
      where project_id = rfi_attachments.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from project_members
      where project_id = rfi_attachments.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
    and exists (
      select 1 from files
      where files.id = rfi_attachments.file_id
        and files.project_id = rfi_attachments.project_id
        and files.is_folder = false
    )
  );

drop policy if exists "Users can view submittal attachments in projects they belong to" on submittal_attachments;
create policy "Users can view submittal attachments in projects they belong to"
  on submittal_attachments for select using (
    public.is_superadmin()
    or exists (
      select 1 from project_members
      where project_id = submittal_attachments.project_id
        and user_id = auth.uid()
    )
  );

drop policy if exists "Project uploaders can manage submittal attachments" on submittal_attachments;
create policy "Project uploaders can manage submittal attachments"
  on submittal_attachments for all using (
    public.is_superadmin()
    or exists (
      select 1 from project_members
      where project_id = submittal_attachments.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from project_members
      where project_id = submittal_attachments.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
    and exists (
      select 1 from files
      where files.id = submittal_attachments.file_id
        and files.project_id = submittal_attachments.project_id
        and files.is_folder = false
    )
  );

with normalized_rfi_attachments as (
  select
    r.project_id,
    r.id as rfi_id,
    (attachment.value->>'id')::uuid as file_id,
    attachment.value
  from rfis r
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(r.attachments_json, '[]'::jsonb)) = 'array' then r.attachments_json
      else '[]'::jsonb
    end
  ) as attachment(value)
  where attachment.value ? 'id'
    and attachment.value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
insert into rfi_attachments (project_id, rfi_id, file_id, name, size_label, file_type, path)
select
  normalized.project_id,
  normalized.rfi_id,
  normalized.file_id,
  coalesce(nullif(normalized.value->>'name', ''), files.name, 'Attachment'),
  coalesce(normalized.value->>'size', ''),
  coalesce(nullif(normalized.value->>'type', ''), 'file'),
  coalesce(nullif(normalized.value->>'path', ''), files.name)
from normalized_rfi_attachments normalized
join files on files.id = normalized.file_id and files.project_id = normalized.project_id
on conflict (rfi_id, file_id) do update set
  name = excluded.name,
  size_label = excluded.size_label,
  file_type = excluded.file_type,
  path = excluded.path;

with normalized_submittal_attachments as (
  select
    s.project_id,
    s.id as submittal_id,
    (attachment.value->>'id')::uuid as file_id,
    attachment.value
  from submittals s
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(s.attachments_json, '[]'::jsonb)) = 'array' then s.attachments_json
      else '[]'::jsonb
    end
  ) as attachment(value)
  where attachment.value ? 'id'
    and attachment.value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
insert into submittal_attachments (project_id, submittal_id, file_id, name, size_label, file_type, path)
select
  normalized.project_id,
  normalized.submittal_id,
  normalized.file_id,
  coalesce(nullif(normalized.value->>'name', ''), files.name, 'Attachment'),
  coalesce(normalized.value->>'size', ''),
  coalesce(nullif(normalized.value->>'type', ''), 'file'),
  coalesce(nullif(normalized.value->>'path', ''), files.name)
from normalized_submittal_attachments normalized
join files on files.id = normalized.file_id and files.project_id = normalized.project_id
on conflict (submittal_id, file_id) do update set
  name = excluded.name,
  size_label = excluded.size_label,
  file_type = excluded.file_type,
  path = excluded.path;
