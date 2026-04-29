-- Preserve MS Project import metadata for clean Gantt and look-ahead views.

alter table public.schedule_activities
  add column if not exists source_order integer;

alter table public.schedule_activities
  add column if not exists source_wbs text;

alter table public.schedule_activities
  add column if not exists predecessor_refs text;

create index if not exists schedule_activities_project_source_order_idx
  on public.schedule_activities(project_id, source_order);
