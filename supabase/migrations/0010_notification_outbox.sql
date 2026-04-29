-- Notification outbox, project notification matrix, and photo subscriptions.
-- Modeled after Procore-style event matrices: workflow/action-required emails
-- are mandatory, optional matrix rows are configurable, and uploaded photos can
-- be delivered as an hourly digest.

alter table rfis
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists rfi_manager_id uuid references auth.users(id) on delete set null;

create index if not exists rfis_created_by_idx on rfis(created_by);
create index if not exists rfis_rfi_manager_id_idx on rfis(rfi_manager_id);

update rfis
set rfi_manager_id = (
  select pm.user_id
  from project_members pm
  where pm.project_id = rfis.project_id
    and pm.role = 'admin'
  order by pm.created_at asc
  limit 1
)
where rfi_manager_id is null;

create table if not exists notification_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null,
  entity_type text not null,
  entity_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  dedupe_key text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed', 'duplicate')),
  error text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create index if not exists notification_events_project_created_idx
  on notification_events(project_id, created_at desc);

create index if not exists notification_events_type_idx
  on notification_events(type);

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references notification_events(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  recipient_user_id uuid references auth.users(id) on delete set null,
  recipient_email text,
  recipient_name text,
  channel text not null default 'email' check (channel in ('email')),
  subject text not null,
  html text not null,
  status text not null default 'pending' check (status in ('pending', 'queued', 'processing', 'sent', 'skipped', 'failed')),
  provider_message_id text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  unique(event_id, recipient_email, channel)
);

create index if not exists notification_deliveries_project_created_idx
  on notification_deliveries(project_id, created_at desc);

create index if not exists notification_deliveries_status_idx
  on notification_deliveries(status, created_at);

create index if not exists notification_deliveries_recipient_idx
  on notification_deliveries(recipient_user_id, created_at desc);

create table if not exists notification_preferences (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  channel text not null default 'email' check (channel in ('email')),
  enabled boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (project_id, user_id, event_type, channel)
);

drop trigger if exists notification_preferences_updated_at on notification_preferences;
create trigger notification_preferences_updated_at before update on notification_preferences
  for each row execute function update_updated_at_column();

create table if not exists notification_rules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  event_type text not null,
  recipient_kind text not null,
  enabled boolean not null default true,
  required boolean not null default false,
  digest_frequency text not null default 'immediate' check (digest_frequency in ('immediate', 'hourly')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique(project_id, event_type, recipient_kind)
);

create unique index if not exists notification_rules_global_unique_idx
  on notification_rules(event_type, recipient_kind)
  where project_id is null;

drop trigger if exists notification_rules_updated_at on notification_rules;
create trigger notification_rules_updated_at before update on notification_rules
  for each row execute function update_updated_at_column();

create table if not exists photo_subscriptions (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  last_digest_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (project_id, user_id)
);

drop trigger if exists photo_subscriptions_updated_at on photo_subscriptions;
create trigger photo_subscriptions_updated_at before update on photo_subscriptions
  for each row execute function update_updated_at_column();

alter table notification_events enable row level security;
alter table notification_deliveries enable row level security;
alter table notification_preferences enable row level security;
alter table notification_rules enable row level security;
alter table photo_subscriptions enable row level security;

drop policy if exists "Users can view notification events for projects they belong to" on notification_events;
drop policy if exists "Project admins can view notification events" on notification_events;
create policy "Project admins can view notification events"
  on notification_events for select using (
    public.project_role(notification_events.project_id, auth.uid()) = 'admin'
  );

drop policy if exists "Users can view notification deliveries for projects they belong to" on notification_deliveries;
drop policy if exists "Users can view their notification deliveries" on notification_deliveries;
create policy "Users can view their notification deliveries"
  on notification_deliveries for select using (
    recipient_user_id = auth.uid()
    or public.project_role(notification_deliveries.project_id, auth.uid()) = 'admin'
  );

drop policy if exists "Users can manage their notification preferences" on notification_preferences;
create policy "Users can manage their notification preferences"
  on notification_preferences for all using (
    user_id = auth.uid()
    and exists (
      select 1 from project_members
      where project_id = notification_preferences.project_id and user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from project_members
      where project_id = notification_preferences.project_id and user_id = auth.uid()
    )
  );

drop policy if exists "Users can view notification rules for projects they belong to" on notification_rules;
create policy "Users can view notification rules for projects they belong to"
  on notification_rules for select using (
    project_id is null
    or exists (
      select 1 from project_members
      where project_id = notification_rules.project_id and user_id = auth.uid()
    )
  );

drop policy if exists "Project admins can manage notification rules" on notification_rules;
create policy "Project admins can manage notification rules"
  on notification_rules for all using (
    project_id is not null and public.project_role(project_id, auth.uid()) = 'admin'
  )
  with check (
    project_id is not null and public.project_role(project_id, auth.uid()) = 'admin'
  );

drop policy if exists "Users can manage their photo subscriptions" on photo_subscriptions;
create policy "Users can manage their photo subscriptions"
  on photo_subscriptions for all using (
    user_id = auth.uid()
    and exists (
      select 1 from project_members
      where project_id = photo_subscriptions.project_id and user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from project_members
      where project_id = photo_subscriptions.project_id and user_id = auth.uid()
    )
  );

drop policy if exists "superadmin bypass select" on notification_events;
drop policy if exists "superadmin bypass insert" on notification_events;
drop policy if exists "superadmin bypass update" on notification_events;
drop policy if exists "superadmin bypass delete" on notification_events;
create policy "superadmin bypass select" on notification_events for select using (public.is_superadmin());
create policy "superadmin bypass insert" on notification_events for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on notification_events for update using (public.is_superadmin());
create policy "superadmin bypass delete" on notification_events for delete using (public.is_superadmin());

drop policy if exists "superadmin bypass select" on notification_deliveries;
drop policy if exists "superadmin bypass insert" on notification_deliveries;
drop policy if exists "superadmin bypass update" on notification_deliveries;
drop policy if exists "superadmin bypass delete" on notification_deliveries;
create policy "superadmin bypass select" on notification_deliveries for select using (public.is_superadmin());
create policy "superadmin bypass insert" on notification_deliveries for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on notification_deliveries for update using (public.is_superadmin());
create policy "superadmin bypass delete" on notification_deliveries for delete using (public.is_superadmin());

drop policy if exists "superadmin bypass select" on notification_preferences;
drop policy if exists "superadmin bypass insert" on notification_preferences;
drop policy if exists "superadmin bypass update" on notification_preferences;
drop policy if exists "superadmin bypass delete" on notification_preferences;
create policy "superadmin bypass select" on notification_preferences for select using (public.is_superadmin());
create policy "superadmin bypass insert" on notification_preferences for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on notification_preferences for update using (public.is_superadmin());
create policy "superadmin bypass delete" on notification_preferences for delete using (public.is_superadmin());

drop policy if exists "superadmin bypass select" on notification_rules;
drop policy if exists "superadmin bypass insert" on notification_rules;
drop policy if exists "superadmin bypass update" on notification_rules;
drop policy if exists "superadmin bypass delete" on notification_rules;
create policy "superadmin bypass select" on notification_rules for select using (public.is_superadmin());
create policy "superadmin bypass insert" on notification_rules for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on notification_rules for update using (public.is_superadmin());
create policy "superadmin bypass delete" on notification_rules for delete using (public.is_superadmin());

drop policy if exists "superadmin bypass select" on photo_subscriptions;
drop policy if exists "superadmin bypass insert" on photo_subscriptions;
drop policy if exists "superadmin bypass update" on photo_subscriptions;
drop policy if exists "superadmin bypass delete" on photo_subscriptions;
create policy "superadmin bypass select" on photo_subscriptions for select using (public.is_superadmin());
create policy "superadmin bypass insert" on photo_subscriptions for insert with check (public.is_superadmin());
create policy "superadmin bypass update" on photo_subscriptions for update using (public.is_superadmin());
create policy "superadmin bypass delete" on photo_subscriptions for delete using (public.is_superadmin());

insert into notification_rules (project_id, event_type, recipient_kind, enabled, required, digest_frequency)
select null, defaults.event_type, defaults.recipient_kind, defaults.enabled, defaults.required, defaults.digest_frequency
from (
  values
    ('rfi.created', 'rfi_manager', true, false, 'immediate'),
    ('rfi.created', 'assignee', true, false, 'immediate'),
    ('rfi.created', 'distribution', true, false, 'immediate'),
    ('rfi.ball_in_court_shift', 'assignee', true, true, 'immediate'),
    ('rfi.assigned', 'rfi_manager', true, false, 'immediate'),
    ('rfi.assigned', 'assignee', true, false, 'immediate'),
    ('rfi.assigned', 'distribution', true, false, 'immediate'),
    ('rfi.response_added', 'rfi_manager', true, false, 'immediate'),
    ('rfi.response_added', 'assignee', true, false, 'immediate'),
    ('rfi.response_added', 'distribution', true, false, 'immediate'),
    ('rfi.closed', 'creator', true, false, 'immediate'),
    ('rfi.closed', 'rfi_manager', true, false, 'immediate'),
    ('rfi.closed', 'assignee', true, false, 'immediate'),
    ('rfi.closed', 'distribution', true, false, 'immediate'),
    ('rfi.reopened', 'rfi_manager', true, false, 'immediate'),
    ('rfi.reopened', 'assignee', true, false, 'immediate'),
    ('rfi.reopened', 'distribution', true, false, 'immediate'),
    ('rfi.due_date_changed', 'rfi_manager', true, false, 'immediate'),
    ('rfi.due_date_changed', 'assignee', true, false, 'immediate'),
    ('submittal.created', 'owner', true, false, 'immediate'),
    ('submittal.created', 'project_admins', true, false, 'immediate'),
    ('submittal.action_required', 'workflow_assignee', true, true, 'immediate'),
    ('submittal.workflow_step_completed', 'owner', true, false, 'immediate'),
    ('submittal.workflow_step_completed', 'project_admins', true, false, 'immediate'),
    ('submittal.updated', 'owner', true, false, 'immediate'),
    ('submittal.updated', 'project_admins', false, false, 'immediate'),
    ('submittal.approved', 'owner', true, false, 'immediate'),
    ('submittal.approved', 'project_admins', true, false, 'immediate'),
    ('submittal.revise_resubmit', 'owner', true, false, 'immediate'),
    ('submittal.revise_resubmit', 'project_admins', true, false, 'immediate'),
    ('submittal.rejected', 'owner', true, false, 'immediate'),
    ('submittal.rejected', 'project_admins', true, false, 'immediate'),
    ('photo.uploaded', 'photo_subscribers', true, false, 'hourly'),
    ('photo.shared', 'shared_users', true, true, 'immediate'),
    ('photo.comment_mentioned', 'mentioned_users', true, true, 'immediate')
) as defaults(event_type, recipient_kind, enabled, required, digest_frequency)
where not exists (
  select 1
  from notification_rules existing
  where existing.project_id is null
    and existing.event_type = defaults.event_type
    and existing.recipient_kind = defaults.recipient_kind
);
