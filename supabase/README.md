# Supabase Setup — Project Portal

## Quick Start

### 1. Initialize Supabase (one-time)

```bash
cd project-portal
supabase init
```

### 2. Link to Your Supabase Project

```bash
supabase link --project-ref <your-project-ref>
```

Find your project ref in the Supabase dashboard URL: `https://app.supabase.com/project/<project-ref>`.

### 3. Push the Initial Migration

```bash
supabase db push
```

This runs `migrations/0001_init.sql`, creating all tables, enums, indexes, RLS policies, and the `update_updated_at_column()` trigger.

### 4. Seed Sample Data (Optional)

```bash
supabase db seed
```

This inserts test data for one project (CSF #1646), schedule activities, submittals, RFIs, chat, and updates. Useful for local development.

**Note:** The seed assumes auth.users rows already exist. In production, users sign up via magic-link; seed only creates profile and content rows.

---

## Schema Overview

**Tables:**
- `profiles` — extends auth.users with full_name, role, company, title
- `projects` — one per PE undertaking (slug, name, customer, phase, percent_complete, etc.)
- `project_members` — enforces per-project access control (role: admin/member/guest/readonly)
- `files` — folder tree + metadata, storage_key points to a Tigris object
- `schedule_activities` — MS Project import: phase, dates, owner, status
- `submittals` — classic routing workflow (Submitted → In Review → Approved / R&R / Rejected)
- `submittal_routing_steps` — handoff chain with reviewer sign-offs
- `rfis` — RFI workflow (Open → Answered → Closed) with creator, RFI manager, assignee, due-date, and answer fields
- `chat_subjects` — discussion threads per project
- `chat_messages` — belong to a subject
- `updates` — PM-authored posts (OAC recap, weekly, phase kickoff, safety)
- `share_tokens` — public links (file, update preview) with expiry
- `admin_audit_log` — superadmin action audit trail
- `notification_events` — durable outbox rows for RFI, submittal, and photo notification events
- `notification_deliveries` — per-recipient email delivery attempts, statuses, and provider ids
- `notification_preferences` — per-user optional email preferences by project and event type
- `notification_rules` — project notification matrix overriding Procore-style defaults
- `photo_subscriptions` — daily uploaded-photo digest subscriptions

**Enums:**
- `project_phase` — pre_con, design, construction, closeout
- `member_role` — admin, member, guest, readonly
- `submittal_status` — draft, submitted, in_review, approved, revise_resubmit, rejected
- `rfi_status` — open, answered, closed
- `update_kind` — oac_recap, weekly, phase_kickoff, safety, general

**RLS Policies:**
- All tables enforce per-project access via `project_members`.
- Admins can do everything; members can insert/update/read; guests can read and insert chat/comments; readonly can only SELECT.
- RFIs/submittals are hardened with helper policies: admins/members can create; admins/members/guests can review/update; readonly users stay read-only.
- Notification preferences are self-service; project notification matrix rows are admin-managed; server-side notification processing uses service-role access.
- Share tokens bypass RLS (served via service-role-backed API routes with token validation).

---

## Enable Realtime (Chat)

To stream chat messages in real-time, enable Supabase Realtime on `chat_messages`:

```sql
alter publication supabase_realtime add table chat_messages;
```

Or via the Supabase dashboard: **Replication** → toggle `chat_messages` on.

Then subscribe on the client:

```typescript
const channel = supabase
  .channel(`project:${projectId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'chat_messages',
    filter: `subject_id=eq.${subjectId}`
  }, (payload) => {
    // handle new message
  })
  .subscribe();
```

---

## File Storage (Tigris, External)

Files are **not** stored in Supabase. The `files` table is metadata only.

### Setup (one-time):

1. Create or use the existing Tigris bucket/container: `project-portal-files`
2. Generate S3-compatible access keys with read/write scope
3. Store in your `.env.local`:

```
TIGRIS_ENDPOINT=https://t3.storage.dev
TIGRIS_ACCESS_KEY_ID=<your-access-key>
TIGRIS_SECRET_ACCESS_KEY=<your-secret>
TIGRIS_BUCKET=project-portal-files
TIGRIS_REGION=auto
```

### Upload Flow:

In your Next.js API route (e.g., `/api/files/upload`):

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.TIGRIS_REGION ?? 'auto',
  credentials: {
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.TIGRIS_ENDPOINT,
  forcePathStyle: true,
});

const command = new PutObjectCommand({
  Bucket: 'project-portal-files',
  Key: `${projectId}/${fileId}`,
  Body: fileStream,
});

await s3.send(command);
```

Then insert a row in `files` with `storage_key = '${projectId}/${fileId}'`.

### Download Flow:

The app routes downloads through `/api/files/[id]/download`, checks metadata access when Supabase is configured, and streams the object from Tigris so PDF previews stay same-origin.

---

## Single-Tenant → Multi-Tenant Retrofit

This schema is designed to add multi-tenancy later without a rewrite.

To retrofit:

1. Add an `orgs` table with `id PK, name, slug, created_at`
2. Add `org_id uuid FK` to: projects, profiles, etc.
3. Change `org_id = 1` defaults to real foreign keys
4. Add one RLS predicate per table: `exists (select 1 from orgs where id = ... and org_id = auth.org_id())`
5. Update API route logic to enforce org boundaries

No schema redesign needed.

---

## Development Workflow

```bash
# Create a new migration
supabase migration new add_example_table

# Edit supabase/migrations/YYYYMMDDHHMMSS_add_example_table.sql

# Test locally
supabase db reset  # drops and rebuilds from migrations + seed

# Push to remote
supabase db push

# View logs
supabase logs --tail
```

---

## Notes

- **All timestamps** are UTC (timestamp with time zone).
- **UUID primary keys** use `gen_random_uuid()` (requires `pgcrypto` extension, enabled in migration).
- **Updated-at triggers** are set on all mutable tables for audit trails.
- **Indexes** are created on foreign keys and common filter/sort columns to keep queries fast.
- **Row-level security** is enabled on all tables; the service role (used by Next.js server components) bypasses RLS for admin operations.
