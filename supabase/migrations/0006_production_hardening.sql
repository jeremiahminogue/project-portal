-- Production hardening for project workflow authorization and admin audit.

create or replace function public.project_role(p_project_id uuid, p_user_id uuid)
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.project_members
  where project_id = p_project_id
    and user_id = p_user_id
  limit 1;
$$;

create or replace function public.can_project_write(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.project_role(p_project_id, p_user_id) in ('admin', 'member'), false);
$$;

create or replace function public.can_project_review(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.project_role(p_project_id, p_user_id) in ('admin', 'member', 'guest'), false);
$$;

revoke all on function public.project_role(uuid, uuid) from public;
revoke all on function public.can_project_write(uuid, uuid) from public;
revoke all on function public.can_project_review(uuid, uuid) from public;
grant execute on function public.project_role(uuid, uuid) to authenticated;
grant execute on function public.can_project_write(uuid, uuid) to authenticated;
grant execute on function public.can_project_review(uuid, uuid) to authenticated;

drop policy if exists "Project members can insert RFIs" on rfis;
drop policy if exists "Project members can update RFIs" on rfis;

create policy "Project members can insert RFIs"
  on rfis for insert with check (
    public.can_project_write(project_id, auth.uid())
  );

create policy "Project reviewers can update RFIs"
  on rfis for update
  using (
    public.can_project_review(project_id, auth.uid())
  )
  with check (
    public.can_project_review(project_id, auth.uid())
  );

drop policy if exists "Project members can insert submittals" on submittals;
drop policy if exists "Project members can update submittals" on submittals;

create policy "Project members can insert submittals"
  on submittals for insert with check (
    public.can_project_write(project_id, auth.uid())
  );

create policy "Project reviewers can update submittals"
  on submittals for update
  using (
    public.can_project_review(project_id, auth.uid())
  )
  with check (
    public.can_project_review(project_id, auth.uid())
  );

drop policy if exists "Project members can insert routing steps" on submittal_routing_steps;
drop policy if exists "Project members can update routing steps" on submittal_routing_steps;

create policy "Project members can insert routing steps"
  on submittal_routing_steps for insert with check (
    exists (
      select 1
      from submittals s
      where s.id = submittal_routing_steps.submittal_id
        and public.can_project_write(s.project_id, auth.uid())
    )
  );

create policy "Project reviewers can update routing steps"
  on submittal_routing_steps for update
  using (
    exists (
      select 1
      from submittals s
      where s.id = submittal_routing_steps.submittal_id
        and public.can_project_review(s.project_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from submittals s
      where s.id = submittal_routing_steps.submittal_id
        and public.can_project_review(s.project_id, auth.uid())
    )
  );

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on admin_audit_log(created_at desc);

create index if not exists admin_audit_log_target_idx
  on admin_audit_log(target_type, target_id);

alter table admin_audit_log enable row level security;

drop policy if exists "superadmin audit select" on admin_audit_log;
drop policy if exists "superadmin audit insert" on admin_audit_log;

create policy "superadmin audit select"
  on admin_audit_log for select using (public.is_superadmin());

create policy "superadmin audit insert"
  on admin_audit_log for insert with check (public.is_superadmin());
