-- RFI detail fields and update attachment support.

alter table rfis
  add column if not exists suggested_solution text,
  add column if not exists reference text;

alter table updates
  alter column attachments_json set default '[]'::jsonb;

update updates
set attachments_json = '[]'::jsonb
where attachments_json is null or attachments_json = '{}'::jsonb;
