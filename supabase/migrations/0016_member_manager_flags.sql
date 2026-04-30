-- Per-project manager flags. A project member can be designated as the
-- submittal manager and/or RFI manager for that project. Multiple members
-- can hold each flag (so a backup manager covers vacations).
--
-- These flags are *additive* to the existing `role` column — they don't
-- grant project-wide admin powers, just the routing/inbox responsibility
-- for unrouted submittals and RFIs.

alter table project_members
  add column if not exists is_submittal_manager boolean not null default false,
  add column if not exists is_rfi_manager boolean not null default false;

create index if not exists project_members_submittal_manager_idx
  on project_members(project_id) where is_submittal_manager;
create index if not exists project_members_rfi_manager_idx
  on project_members(project_id) where is_rfi_manager;
