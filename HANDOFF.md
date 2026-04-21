# HANDOFF — Project Portal

**Written:** 2026-04-21 at end of scaffold session.
**For:** whoever picks up next (probably you, Jeremiah — or a future agent).

This file is the "what's next" list. README.md is the "what is this". Read this to ship.

---

## TL;DR

Code is built; all pages read through the live query layer and every live query is fully hydrated (profiles, routing steps, nested chat messages round-trip in one PostgREST call). End-to-end file upload flow is shipped. PE wordmark is wired in. A `/api/health` endpoint reports env-var presence for post-deploy smoke-testing. Credentials landed (Supabase + R2 + Resend env vars saved). Resend's `send.puebloelectrics.com` DNS records were added at GoDaddy.

`npx tsc --noEmit` → exit 0. `next build` → **14 routes**, 0 errors.

What's *not* done, in order of priority:

1. ~~Create Supabase project + paste creds into `.env.local`.~~ **Done 2026-04-21** — creds saved by Jeremiah.
2. Push the migration + seed (`npx supabase db push && npx supabase db seed`).
3. ~~Wire magic-link auth (login page + callback route).~~ **Done 2026-04-21** — see §4 for invitation workflow.
4. ~~Build query wrappers (`lib/queries/*`).~~ **Done 2026-04-21** — see §5 for swap instructions.
5. ~~Wire R2 upload route.~~ **Done 2026-04-21** — `POST /api/files/upload-url`, see §6.
6. ~~Wire sign-out UI.~~ **Done 2026-04-21** — UserMenu dropdown on the avatar.
7. ~~Cloudflare R2 bucket + token.~~ **Done 2026-04-21 pm** — bucket `project-portal-files`, token scoped to it.
8. ~~Resend API key + sending domain DNS.~~ **Done 2026-04-21 pm** — domain `send.puebloelectrics.com`; click Verify in Resend after DNS propagates (5–30 min).
9. ~~Swap pages from `data/*.ts` mock imports to live queries.~~ **Done 2026-04-21 late pm** — all 8 pages + the project layout now read from `@/lib/queries`.
10. ~~Client-side upload form on the files screen.~~ **Done 2026-04-21 late pm** — `FileUploadButton` component + `POST /api/files` endpoint complete the end-to-end flow.
11. ~~Hydration upgrades — joins for `submittal_routing_steps`, `profiles` (author/uploadedBy), `project_members` (directory), `chat_messages`.~~ **Done 2026-04-21 evening** — all five live queries now round-trip real data (names, companies, routing chains, nested chat messages) via PostgREST nested selects. See PROGRESS.md for the per-file diff.
12. ~~Drop `pe_logo.png` into `public/brand/`.~~ **Done 2026-04-21 night** — asset is `public/brand/Pueblo_Electrics-1.png`, wired into `PELogo` via `next/image` with correct intrinsic dims + `priority`.
13. Schema adds for richer hydration (future, optional) — `reactions`, `attachments`, `chat_subjects.description`, `chat_message_reads`, `update_comments` / `update_likes`. Pages render fine without them today.
14. **Create git repo + push to GitHub** — `git init` inside the Cowork sandbox left a poisoned `.git/` (mount blocks `unlink`), so the flow must run on Jeremiah's own machine. Full runbook at workspace-root `REPO_SETUP.md` (it starts with `rm -rf .git` to clear the stub). `.gitignore` at workspace root covers OS cruft; `project-portal/.gitignore` covers app-level ignores.
15. Deploy to Vercel — then hit `GET /api/health` to confirm env vars landed.

### Env vars Jeremiah has already saved into `.env.local`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID` (= `00defb1cef364da8e8245a5a4b2f926d`, public), `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (= `project-portal-files`)
- `RESEND_API_KEY`
- (after Verify passes) set `RESEND_FROM` to `noreply@send.puebloelectrics.com` or similar.

---

## 1. Supabase Setup (10 min)

```bash
# From project-portal/
npx supabase init                   # creates supabase/config.toml (ok to commit)
npx supabase login                  # browser OAuth
npx supabase projects create        # or use an existing project
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push                # runs migrations/0001_init.sql
npx supabase db seed                # runs seed.sql (optional — seeds CSF #1646)
```

Where to find each env var:

| Env var | Where in Supabase dashboard |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon` public |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (server-only, never ship to client) |

Then:

```bash
cp .env.local.example .env.local
# fill in the 3 Supabase values above
```

Enable realtime on `chat_messages` in the Supabase dashboard: Database → Replication → toggle `chat_messages` on. Required for the chat screen to stream new posts.

---

## 2. Cloudflare R2 Setup (5 min)

1. Cloudflare dashboard → R2 → Create bucket → name it `project-portal-files`.
2. Create an API token: R2 → Manage R2 API Tokens → Create → "Object Read & Write".
3. Paste into `.env.local`:
   - `R2_ENDPOINT` — something like `https://<account-id>.r2.cloudflarestorage.com`
   - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — from the token
4. Optional: bind a custom domain (`files.portal.puebloelectrics.com`) and set `R2_PUBLIC_BASE_URL`.

We're not using the Supabase Storage product — files live in R2 for zero egress. Supabase's `files` table only stores the `storage_key` (the object path in R2).

---

## 3. Resend (5 min)

1. resend.com → API Keys → Create → paste into `RESEND_API_KEY`.
2. Verify `puebloelectrics.com` as a sending domain (DNS records).
3. Update `RESEND_FROM` if you want a different sender display.

Used by: magic-link emails + per-activity digest emails. Neither is wired yet.

---

## 4. Auth — Done (2026-04-21)

Shipped:

- `app/login/page.tsx` + `app/login/login-form.tsx` — magic-link email form. Invite-only (`shouldCreateUser: false`).
- `app/auth/callback/route.ts` — exchanges `?code=` for session, redirects to `?next=` (open-redirect-safe).
- `app/auth/signout/route.ts` — POST-only sign out.
- `middleware.ts` (root) — gates `/`, `/projects/**`, `/directory`. Env-var-guarded: traffic passes through when Supabase env vars are absent (keeps mock-data dev working).
- `lib/supabase/middleware.ts` — `createMiddlewareClient` helper for the `@supabase/ssr` cookie dance.

**Inviting a user (once Supabase is live):**
The flow is invite-only by design. To let someone in:

1. In Supabase dashboard → **Authentication → Users → Invite user** (or use the admin API from a server action).
2. Insert a `project_members` row mapping their new `auth.users.id` to the project they should see.
3. Send them the portal URL. They enter their email on `/login`, click the emailed magic link, land in.

If you want a self-service invite UI later, it's a small Next.js server action calling `supabase.auth.admin.inviteUserByEmail(email)` with the service role key — needs a PE-admin-only page to host it.

**Wiring a sign-out button:**
```tsx
<form method="post" action="/auth/signout">
  <button type="submit">Sign out</button>
</form>
```
Drop that into `components/pe/app-header.tsx` behind a dropdown when you're ready.

Supabase docs if you need to extend: https://supabase.com/docs/guides/auth/server-side/nextjs

---

## 5. Swap Pages to Live Data — Wrappers Ready (2026-04-21)

Query wrappers live in `lib/queries/*.ts`. Each returns the exact types in `data/types.ts` and short-circuits to `data/*.ts` mock when `NEXT_PUBLIC_SUPABASE_URL` is unset.

**Before:**
```tsx
import { projects } from "@/data/projects";
export default function Page() {
  return <div>{projects.map(...)}</div>;
}
```

**After:**
```tsx
import { getProjects } from "@/lib/queries";
export default async function Page() {
  const projects = await getProjects();
  return <div>{projects.map(...)}</div>;
}
```

Available wrappers (`import { ... } from "@/lib/queries"`):

| Wrapper | Signature | Live-mode status |
|---|---|---|
| `getProjects()` | `Promise<Project[]>` | ✅ fully wired |
| `getProject(slug)` | `Promise<Project \| null>` | ✅ fully wired |
| `getProjectId(slug)` | `Promise<string \| null>` | ✅ fully wired |
| `getSchedule(slug)` | `Promise<ScheduleActivity[]>` | ✅ core fields, `type` defaults to `"internal"` |
| `getSubmittals(slug)` | `Promise<Submittal[]>` | ✅ core fields, `owner`/`routing` empty (needs join) |
| `getRfis(slug)` | `Promise<RFI[]>` | ✅ core fields, `assignedTo` empty (needs join) |
| `getFiles(slug)` | `Promise<FileEntry[]>` | ✅ core fields, `uploadedBy` empty (needs join) |
| `getFolders(slug)` | `Promise<FolderEntry[]>` | ✅ shape wired, `fileCount` = 0 (TODO view) |
| `getChatSubjects(slug)` | `Promise<ChatSubject[]>` | ⚠️ mock-only — messages+authors join not built |
| `getUpdates(slug)` | `Promise<Update[]>` | ✅ core fields, `author`/`likes`/`comments` placeholders |
| `getDirectory(slug)` | `Promise<DirectoryEntry[]>` | ⚠️ mock-only — profiles join not built |

"Mock-only" just means live mode also returns the seeded mock data — pages keep rendering on a real deploy instead of breaking. Upgrade those when you need real data there.

**Pages to swap** (in order of least risk):
1. `app/page.tsx` — `getProjects()` — fully wired.
2. `app/projects/[slug]/page.tsx` — `getProject()`.
3. `app/projects/[slug]/schedule/page.tsx` — `getSchedule()`.
4. `app/projects/[slug]/submittals/page.tsx` — `getSubmittals()` + `getRfis()`.
5. `app/projects/[slug]/files/page.tsx` — `getFiles()` + `getFolders()`.
6. `app/projects/[slug]/updates/page.tsx` — `getUpdates()`.
7. `app/projects/[slug]/chat/page.tsx` — `getChatSubjects()` (mock-only for now).
8. `app/projects/[slug]/directory/page.tsx` — `getDirectory()` (mock-only for now).

---

## 6. R2 Upload Route — Wired (2026-04-21)

`POST /api/files/upload-url` returns a presigned PUT URL to Cloudflare R2. Browser uploads directly; server never proxies bytes.

**Request:**
```json
{ "projectSlug": "1646", "filename": "Panel-Drawings.pdf", "contentType": "application/pdf", "sizeBytes": 1243000 }
```

**Response (200):**
```json
{ "url": "https://<bucket>.r2.cloudflarestorage.com/projects/1646/2026-04-21/abc-Panel-Drawings.pdf?X-Amz-Signature=...", "key": "projects/1646/2026-04-21/abc-Panel-Drawings.pdf", "bucket": "project-portal-files" }
```

**Auth gates baked in:**
1. Supabase session (401 if absent).
2. `project_members` row with role `admin`|`member` on the project (403 if not).
3. Hard 100 MB cap (413 if over).

**Browser upload snippet:**
```ts
const { url, key } = await fetch("/api/files/upload-url", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectSlug, filename: file.name, contentType: file.type, sizeBytes: file.size }),
}).then(r => r.json());

await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

// Then POST /api/files with { projectSlug, key, name, sizeBytes, mimeType } to record the DB row.
// ^ That second endpoint isn't built yet — small follow-up.
```

R2 helper library: `lib/r2.ts` (`getR2Config`, `getR2Client`, `createPresignedUploadUrl`, `createPresignedDownloadUrl`, `buildStorageKey`).

---

## 6. Branding Polish

- Drop `pe_logo.png` (from `skills/oac-agenda/assets/pe_logo.png` in the parent project) into `public/brand/pe_logo.png`.
- Update `components/pe/pe-logo.tsx` to render the real image via `next/image`.
- Add favicon + `public/apple-touch-icon.png` + OG image.

---

## 7. Deploy to Vercel

```bash
npx vercel link            # one-time; creates .vercel/ (gitignored)
# Push to GitHub; connect the repo in vercel.com
# Add all .env.local keys to Vercel project env
# Push to main → prod; open PRs → preview URLs
```

Custom domain: `portal.puebloelectrics.com` → add in Vercel, update DNS CNAME at whatever DNS provider PE uses.

---

## Gotchas / Lessons From Scaffolding

- **Cowork sandbox + node_modules.** `npm install` inside the Cowork workspace folder produces EPERM warnings during cleanup. They're non-fatal — the install succeeds. `next build` similarly throws EPERM on the post-compile cleanup step but the compiled output is fine. Verified on 2026-04-21 by copying to `/tmp` and rebuilding cleanly.
- **Server vs client components.** Almost every page here is a Server Component. `AppHeader`, `ProjectNav`, `Separator`, `Tabs`, `Avatar`, `ScrollArea` are "use client" because Radix needs the client runtime — but their parents can still be server components.
- **Radix Tabs uncontrolled.** The Submittals page uses `<Tabs defaultValue="submittals">` uncontrolled, which lets the parent stay a server component. Don't "upgrade" it to controlled unless a genuinely-needed feature requires it.
- **ISO date format.** Everything in `data/*.ts` and the SQL schema uses ISO 8601. Never pass `Date` objects as props — they serialize to `{}` across the server-client boundary. `toISOString()` or a pre-formatted string, always.
- **Next 14 `params`.** Route segment params in Next 14 are already-resolved objects, not Promises. Don't `await` them. (Next 15 changes this; revisit when upgrading.)

---

## Decision Log Since Scaffolding

| Decision | Rationale |
|---|---|
| 26 weekly cols on Schedule (not daily) | Readable at a glance; matches mockup philosophy |
| Routing stepper as 4 fixed circles | Matches the S-002 detail in the mockup; dynamic step count can come later |
| Chat preselects first subject (no state) | Keeps the page a server component for v1; add client state when threading lands |
| `"Guest-Admin"` status kept in directory | Some contacts have extra invite powers; not worth flattening |
| Magic-link, invite-only (`shouldCreateUser: false`) | PE controls who gets in; stops random email sign-ups |
| Middleware env-guarded | Mock-data dev keeps working when `.env.local` isn't populated — no broken redirect loops pre-creds |
| Sign-out is POST-only | Prefetch and crawlers can't accidentally log users out via a GET link |
| `?next=` open-redirect check | Only internal paths (leading `/`, not `//`) accepted — stops `/login?next=https://evil.com` attacks |

---

## Open Questions (carry into next session)

- **Comment threading in chat** — flat-per-subject for v1 (done). Threaded replies or keep flat?
- **Server-side preview for `.docx`/`.xlsx`** — mammoth.js/SheetJS on the server and cache the HTML, or just link to download? Server-side adds complexity but looks much better.
- **Domain** — `portal.puebloelectrics.com` vs. a separate brand. Platform Decisions says TBD.
- **ProjectNav Directory link duplication** — the global AppHeader has a `/directory` link (cross-project people view) AND each project nav has its own Directory. Is that intentional, or should one go?

---

## If You're a Future Agent Reading This

1. Run `npm install && npx tsc --noEmit && npx next build` in `/tmp` (not the mounted folder, due to the sandbox EPERM issue) as your green-light smoke test.
2. Everything in `data/*.ts` is canonical mock data. Don't edit it to reflect DB changes — update the DB and change the data loaders.
3. If you're adding a page, follow the pattern: resolve project via `projects.find(p => p.id === params.slug)` + `notFound()` if missing + wrap content in `<PageShell>`. The layout handles the rest of the chrome.
4. If you're adding a shadcn primitive, put it in `components/ui/` with the same pattern (forwardRef, displayName, `cn()`, variants via `cva`).
5. Don't break the rule: **PE-specific things live in `components/pe/`, generic primitives live in `components/ui/`**.
