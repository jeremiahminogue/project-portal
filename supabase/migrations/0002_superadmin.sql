-- # 0002 — Platform superadmin
--
-- Adds a platform-level superadmin role that bypasses every per-project
-- membership gate.
--
-- Motivation:
--   The v1 schema gates all reads and writes behind `project_members` rows.
--   That's the right default for customers (owners, owner's reps, design
--   teams) — they only see projects they're invited to. But Pueblo Electric
--   platform owners need cross-project visibility without being manually
--   inserted into every `project_members` row on every new project.
--
-- Design choice: boolean on `profiles`, not a new enum value.
--   - Enum changes in Postgres are fragile (can add, can't reorder/drop).
--   - Semantically, superadmin is orthogonal to per-project membership.
--     A user can be both a project admin and a platform superadmin —
--     those are different concepts.
--   - Reads nicely in RLS: `public.is_superadmin() or <existing check>`.
--
-- This migration is purely additive — no existing policies are dropped or
-- altered. Postgres RLS is permissive: if ANY policy on a table returns
-- true for a given action, the action is allowed. So we add parallel
-- "superadmin can do anything" policies to each gated table and the
-- existing per-project policies continue to work unchanged.

-- ---------------------------------------------------------------------------
-- 1. Flag column on profiles
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists is_superadmin boolean not null default false;

comment on column profiles.is_superadmin is
  'Platform-level admin. Bypasses all per-project RLS gates. Only set on PE platform owners (e.g. Jeremiah). See migration 0002.';

create index if not exists profiles_is_superadmin_idx
  on profiles(is_superadmin)
  where is_superadmin = true;

-- ---------------------------------------------------------------------------
-- 2. Helper function
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER so that when an RLS policy on some other table calls
-- `public.is_superadmin()`, the function can read the `profiles` row for
-- the current user regardless of RLS on `profiles`. Without SECURITY
-- DEFINER, a user could only read their own profile, which is fine here
-- (the function only reads the calling user's row), but making it
-- explicit avoids surprises if the `profiles` SELECT policy ever
-- tightens.
--
-- Stable: for a given auth.uid() the result doesn't change mid-statement.
-- Lets the planner inline / cache the result across a single query.

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_superadmin from profiles where id = auth.uid()),
    false
  );
$$;

comment on function public.is_superadmin() is
  'True when the current auth.uid() has profiles.is_superadmin = true. Used to bypass per-project RLS gates. Added by migration 0002.';

-- Lock down + re-grant. `authenticated` is enough; an anon caller with no
-- session will always get false anyway.
revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Superadmin bypass policies — one set per RLS-gated table
-- ---------------------------------------------------------------------------
--
-- Four policies per table (SELECT / INSERT / UPDATE / DELETE), each guarded
-- by public.is_superadmin(). Because Postgres RLS is permissive, these OR
-- with whatever per-project policies already exist.
--
-- Naming convention: "superadmin bypass <action>" so they're easy to spot
-- in \d+ output and easy to drop together if we ever need to revoke.

-- profiles
create policy "superadmin bypass select" on profiles for select using (public.is_superadmin());
create policy "superadmin bypass insert" on profiles for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on profiles for update using (public.is_superadmin());
create policy "superadmin bypass delete" on profiles for delete using (public.is_superadmin());

-- projects
create policy "superadmin bypass select" on projects for select using (public.is_superadmin());
create policy "superadmin bypass insert" on projects for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on projects for update using (public.is_superadmin());
create policy "superadmin bypass delete" on projects for delete using (public.is_superadmin());

-- project_members
create policy "superadmin bypass select" on project_members for select using (public.is_superadmin());
create policy "superadmin bypass insert" on project_members for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on project_members for update using (public.is_superadmin());
create policy "superadmin bypass delete" on project_members for delete using (public.is_superadmin());

-- files
create policy "superadmin bypass select" on files for select using (public.is_superadmin());
create policy "superadmin bypass insert" on files for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on files for update using (public.is_superadmin());
create policy "superadmin bypass delete" on files for delete using (public.is_superadmin());

-- schedule_activities
create policy "superadmin bypass select" on schedule_activities for select using (public.is_superadmin());
create policy "superadmin bypass insert" on schedule_activities for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on schedule_activities for update using (public.is_superadmin());
create policy "superadmin bypass delete" on schedule_activities for delete using (public.is_superadmin());

-- submittals
create policy "superadmin bypass select" on submittals for select using (public.is_superadmin());
create policy "superadmin bypass insert" on submittals for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on submittals for update using (public.is_superadmin());
create policy "superadmin bypass delete" on submittals for delete using (public.is_superadmin());

-- submittal_routing_steps
create policy "superadmin bypass select" on submittal_routing_steps for select using (public.is_superadmin());
create policy "superadmin bypass insert" on submittal_routing_steps for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on submittal_routing_steps for update using (public.is_superadmin());
create policy "superadmin bypass delete" on submittal_routing_steps for delete using (public.is_superadmin());

-- rfis
create policy "superadmin bypass select" on rfis for select using (public.is_superadmin());
create policy "superadmin bypass insert" on rfis for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on rfis for update using (public.is_superadmin());
create policy "superadmin bypass delete" on rfis for delete using (public.is_superadmin());

-- chat_subjects
create policy "superadmin bypass select" on chat_subjects for select using (public.is_superadmin());
create policy "superadmin bypass insert" on chat_subjects for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on chat_subjects for update using (public.is_superadmin());
create policy "superadmin bypass delete" on chat_subjects for delete using (public.is_superadmin());

-- chat_messages
create policy "superadmin bypass select" on chat_messages for select using (public.is_superadmin());
create policy "superadmin bypass insert" on chat_messages for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on chat_messages for update using (public.is_superadmin());
create policy "superadmin bypass delete" on chat_messages for delete using (public.is_superadmin());

-- updates
create policy "superadmin bypass select" on updates for select using (public.is_superadmin());
create policy "superadmin bypass insert" on updates for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on updates for update using (public.is_superadmin());
create policy "superadmin bypass delete" on updates for delete using (public.is_superadmin());

-- share_tokens
create policy "superadmin bypass select" on share_tokens for select using (public.is_superadmin());
create policy "superadmin bypass insert" on share_tokens for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on share_tokens for update using (public.is_superadmin());
create policy "superadmin bypass delete" on share_tokens for delete using (public.is_superadmin());
