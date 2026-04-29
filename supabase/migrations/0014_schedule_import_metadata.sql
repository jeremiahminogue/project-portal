-- Preserve MS Project import metadata for clean Gantt and look-ahead views.

alter table schedule_activities
  add column if not exists source_order integer,
  add column if not exists source_wbs text,
  add column if not exists predecessor_refs text;

create index if not exists schedule_activities_project_source_order_idx
  on schedule_activities(project_id, source_order);
