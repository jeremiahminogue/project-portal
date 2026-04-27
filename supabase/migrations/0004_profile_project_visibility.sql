-- Allow project members to see directory/profile information for people
-- assigned to the same project. Auth still owns identity; this only exposes
-- the portal profile fields needed for directory, assignments, and routing.

create or replace function public.shares_project_with(profile_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid()
      and theirs.user_id = profile_user_id
  );
$$;

comment on function public.shares_project_with(uuid)
  is 'True when the current auth user shares at least one project with the supplied profile user id.';

revoke all on function public.shares_project_with(uuid) from public;
grant execute on function public.shares_project_with(uuid) to authenticated;

drop policy if exists "Project members can view co-member profiles" on profiles;
create policy "Project members can view co-member profiles"
  on profiles for select using (
    id = auth.uid()
    or public.shares_project_with(id)
    or public.is_superadmin()
  );
