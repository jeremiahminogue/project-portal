-- Project admins can already INSERT and UPDATE project_members rows
-- (migration 0003 wired the policies via the public.is_project_admin helper),
-- but DELETE was never granted to anything but superadmin (migration 0002).
-- That meant a project admin couldn't remove someone they had just added,
-- which broke the per-project members admin UI.
--
-- Grant DELETE to project admins so the members page can drive its full
-- lifecycle through RLS instead of escalating every delete to the service
-- role. Superadmin still has its own bypass policy from 0002.

drop policy if exists "Project admins can delete project members" on project_members;

create policy "Project admins can delete project members"
  on project_members for delete using (
    public.is_project_admin(project_id, auth.uid())
  );
