-- Project progress editing from the project overview.

drop policy if exists "Project members can update project progress" on public.projects;

create policy "Project members can update project progress"
  on public.projects for update
  using (
    public.can_project_write(id, auth.uid())
  )
  with check (
    public.can_project_write(id, auth.uid())
  );
