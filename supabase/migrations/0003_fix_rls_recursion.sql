-- # 0003 — Fix RLS infinite recursion on project_members
--
-- Motivation:
--   The v1 project_members policies are self-referential:
--
--     create policy "Users can view project members for projects they belong to"
--       on project_members for select using (
--         exists (
--           select 1 from project_members pm2
--           where pm2.project_id = project_members.project_id
--             and pm2.user_id = auth.uid()
--         )
--       );
--
--   When a user queries project_members (directly, or through any other
--   table whose policy does `exists (select 1 from project_members ...)`),
--   Postgres evaluates the SELECT policy. The subquery on project_members
--   triggers the SELECT policy AGAIN, which recurses into itself, and so on
--   until Postgres raises:
--
--     ERROR: infinite recursion detected in policy for relation "project_members"
--
--   The additive superadmin-bypass policies from 0002 don't save us —
--   Postgres still evaluates every permissive policy and detects the cycle
--   before OR-short-circuiting.
--
-- Fix:
--   Same pattern as is_superadmin() in 0002. Wrap the membership check in a
--   SECURITY DEFINER SQL function. The function body runs as the function
--   owner (postgres), which bypasses RLS on project_members, so the
--   subquery inside it does NOT re-trigger the policy. The policy body
--   itself just calls the function — no recursion.
--
-- Scope:
--   Only the three self-referencing project_members policies need to
--   change. Policies on OTHER tables (files, submittals, etc.) that do
--   `exists (select 1 from project_members ...)` work fine once the
--   project_members policy stops recursing — those subqueries fire the
--   project_members SELECT policy exactly ONCE, which now returns quickly
--   via the helper function. No further migration needed for those.

-- ---------------------------------------------------------------------------
-- 1. Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_project_member(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = p_user_id
  );
$$;

comment on function public.is_project_member(uuid, uuid) is
  'True when (user_id) is a member of (project_id). SECURITY DEFINER so callers from RLS policies bypass project_members own RLS and avoid infinite recursion. Added by migration 0003.';

create or replace function public.is_project_admin(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id
      and user_id = p_user_id
      and role = 'admin'
  );
$$;

comment on function public.is_project_admin(uuid, uuid) is
  'True when (user_id) has role=admin on (project_id). SECURITY DEFINER, see is_project_member. Added by migration 0003.';

revoke all on function public.is_project_member(uuid, uuid) from public;
revoke all on function public.is_project_admin(uuid, uuid) from public;
grant execute on function public.is_project_member(uuid, uuid) to authenticated;
grant execute on function public.is_project_admin(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Drop recursive project_members policies
-- ---------------------------------------------------------------------------

drop policy if exists "Users can view project members for projects they belong to" on project_members;
drop policy if exists "Project admins can insert project members" on project_members;
drop policy if exists "Project admins can update project members" on project_members;

-- ---------------------------------------------------------------------------
-- 3. Recreate using helper functions (no self-reference)
-- ---------------------------------------------------------------------------

create policy "Users can view project members for projects they belong to"
  on project_members for select using (
    public.is_project_member(project_id, auth.uid())
  );

create policy "Project admins can insert project members"
  on project_members for insert with check (
    public.is_project_admin(project_id, auth.uid())
  );

create policy "Project admins can update project members"
  on project_members for update using (
    public.is_project_admin(project_id, auth.uid())
  );
