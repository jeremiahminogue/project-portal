-- Item-level attachments for RFIs and submittals.
-- Attachments are stored as durable file records and denormalized here for
-- fast item views, matching the update attachment pattern.

alter table rfis
  add column if not exists attachments_json jsonb not null default '[]'::jsonb;

alter table submittals
  add column if not exists attachments_json jsonb not null default '[]'::jsonb;

update rfis
set attachments_json = '[]'::jsonb
where attachments_json is null or attachments_json = '{}'::jsonb;

update submittals
set attachments_json = '[]'::jsonb
where attachments_json is null or attachments_json = '{}'::jsonb;
