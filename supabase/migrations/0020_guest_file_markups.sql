-- Allow guest collaborators to save drawing/document markup layers without granting upload or delete access.

drop policy if exists "Project members can insert file markups" on file_markups;
create policy "Project collaborators can insert file markups"
  on file_markups for insert with check (
    exists (
      select 1 from project_members
      where project_id = file_markups.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member', 'guest')
    )
  );

drop policy if exists "Project members can update file markups" on file_markups;
create policy "Project collaborators can update file markups"
  on file_markups for update using (
    exists (
      select 1 from project_members
      where project_id = file_markups.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member', 'guest')
    )
  ) with check (
    exists (
      select 1 from project_members
      where project_id = file_markups.project_id
        and user_id = auth.uid()
        and role in ('admin', 'member', 'guest')
    )
  );
