-- Drawing OCR / sheet indexing metadata.
-- Files remain object-storage backed; this adds project-log metadata and
-- child page rows for multi-page drawing PDFs.

alter table files
  add column if not exists document_kind text not null default 'file'
    check (document_kind in ('drawing', 'specification', 'file')),
  add column if not exists sheet_number text,
  add column if not exists sheet_title text,
  add column if not exists revision text,
  add column if not exists page_count integer not null default 1,
  add column if not exists ocr_status text not null default 'pending'
    check (ocr_status in ('pending', 'indexed', 'partial', 'failed', 'skipped')),
  add column if not exists ocr_text text;

create index if not exists files_project_id_document_kind_idx
  on files(project_id, document_kind);

create index if not exists files_project_id_sheet_number_idx
  on files(project_id, sheet_number)
  where sheet_number is not null;

create table if not exists drawing_pages (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  page_number integer not null,
  name text not null,
  sheet_number text,
  sheet_title text,
  revision text,
  ocr_text text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(file_id, page_number)
);

create trigger drawing_pages_updated_at before update on drawing_pages
  for each row execute function update_updated_at_column();

create index if not exists drawing_pages_file_id_idx on drawing_pages(file_id);
create index if not exists drawing_pages_project_id_idx on drawing_pages(project_id);
create index if not exists drawing_pages_project_id_sheet_number_idx
  on drawing_pages(project_id, sheet_number)
  where sheet_number is not null;

alter table drawing_pages enable row level security;

create policy "Users can view drawing pages in projects they belong to"
  on drawing_pages for select using (
    exists (
      select 1 from project_members
      where project_id = drawing_pages.project_id and user_id = auth.uid()
    )
  );

create policy "Project members can insert drawing pages"
  on drawing_pages for insert with check (
    exists (
      select 1 from project_members
      where project_id = drawing_pages.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

create policy "Project members can update drawing pages"
  on drawing_pages for update using (
    exists (
      select 1 from project_members
      where project_id = drawing_pages.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member')
    )
  );

create policy "Project admins can delete drawing pages"
  on drawing_pages for delete using (
    exists (
      select 1 from project_members
      where project_id = drawing_pages.project_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "superadmin bypass select" on drawing_pages for select using (public.is_superadmin());
create policy "superadmin bypass insert" on drawing_pages for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on drawing_pages for update using (public.is_superadmin());
create policy "superadmin bypass delete" on drawing_pages for delete using (public.is_superadmin());
