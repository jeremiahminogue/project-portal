-- File library folder ordering.
-- Keeps user-managed drawing/document order scoped within each folder.

alter table files
  add column if not exists sort_order integer not null default 0;

create index if not exists files_project_parent_sort_order_idx
  on files(project_id, parent_folder_id, sort_order, updated_at desc)
  where is_folder = false;

