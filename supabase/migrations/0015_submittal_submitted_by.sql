-- Track who originally submitted a submittal so revise/reject can kick the
-- ball back to that user instead of leaving it stranded on the last reviewer.
-- Default the column for legacy rows to current owner so existing kickback
-- still has a target; new rows are populated explicitly by createSubmittal.

alter table submittals
  add column if not exists submitted_by uuid references auth.users(id) on delete set null;

update submittals
  set submitted_by = owner
  where submitted_by is null
    and owner is not null;

create index if not exists submittals_submitted_by_idx on submittals(submitted_by);
