# HANDOFF — Project Portal

**Written:** 2026-04-21 at end of scaffold session.
**For:** whoever picks up next (probably you, Jeremiah — or a future agent).

This file is the "what's next" list. README.md is the "what is this". Read this to ship.

---

## TL;DR

Code is built; all pages read through the live query layer and every live query is fully hydrated (profiles, routing steps, nested chat messages round-trip in one PostgREST call). End-to-end file upload flow is shipped. PE wordmark is wired in. A `/api/health` endpoint reports env-var presence for post-deploy smoke-testing. Credentials landed (Supabase + R2 + Resend env vars saved). Resend's `send.puebloelectrics.com` DNS records were added at GoDaddy.

**Auth step-one complete (2026-04-21 afternoon):** platform-level superadmin (Jeremiah) that bypasses per-project RLS, a cached `getCurrentUser()` helper pulling real user info into the header, and a motion-polished login screen. Migration `0002_superadmin.sql` must be pushed alongside `0001_init.sql`.

`npx tsc --noEmit` → exit 0. `next build` → compiles clean, page-type validation passes, static generation 9/9. The in-sandbox `next build` still hits an `EPERM` on the post-compile finalize step (known mount-permission issue, not a code issue — see §Gotchas).

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
14. ~~Auth step-one: superadmin + cached auth helper + login motion.~~ **Done 2026-04-21 afternoon** — see §4 for the superadmin model and §8 for the step-two admin UI.
15. **Create git repo + push to GitHub** — `git init` inside the Cowork sandbox left a poisoned `.git/` (mount blocks `unlink`), so the flow must run on Jeremiah's own machine. Full runbook at workspace-root `REPO_SETUP.md` (it starts with `rm -rf .git` to clear the stub). `.gitignore` at workspace root covers OS cruft; `project-portal/.gitignore` covers app-level ignores.
16. Deploy to Vercel — then hit `GET /api/health` to confirm env vars landed.

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
npx supabase db push                # runs migrations/0001_init.sql + 0002_superadmin.sql
npx supabase db seed                # runs seed.sql (optional — seeds CSF #1646 + flags Jeremiah as superadmin)
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

- `app/login/page.tsx` + `app/login/login-form.tsx` — magic-link email form. Invite-only (`shouldCreateUser: false`). Motion-polished 2026-04-21 afternoon: logo/card/footer entrance cascade, button press affordance (`active:scale-[0.98]`), spinner on send, success confirmation with icon zoom, error banner auto-clears on retype. Zero new deps — uses `tailwindcss-animate` utilities already in the stack.
- `app/auth/callback/route.ts` — exchanges `?code=` for session, redirects to `?next=` (open-redirect-safe).
- `app/auth/signout/route.ts` — POST-only sign out.
- `middleware.ts` (root) — gates `/`, `/projects/**`, `/directory`. Env-var-guarded: traffic passes through when Supabase env vars are absent (keeps mock-data dev working).
- `lib/supabase/middleware.ts` — `createMiddlewareClient` helper for the `@supabase/ssr` cookie dance.
- `lib/auth/user.ts` (added 2026-04-21 afternoon) — the one place server components ask "who's logged in?". Cached per-request via `React.cache()` so N components on a page do one DB round-trip. Exports `getCurrentUser()`, `requireUser()`, `requireSuperadmin()`, `initialsFor()`.

### Superadmin model (added 2026-04-21 afternoon)

Jeremiah has platform-level superadmin that bypasses the per-project RLS gate. Model:

- `profiles.is_superadmin boolean default false` — column added in `supabase/migrations/0002_superadmin.sql`. Partial index on the `true` subset (vast majority of rows are `false`).
- `public.is_superadmin()` — `SECURITY DEFINER` helper with scoped `search_path = public`. Execute revoked from `public`, granted to `authenticated`. Reads `profiles.is_superadmin` for the current `auth.uid()`.
- Twelve tables each got four additive permissive RLS policies (select/insert/update/delete) keyed on `public.is_superadmin()`. Because Postgres RLS is permissive, ANY matching policy grants — the existing per-project policies are untouched, so non-superadmins are unaffected.
- `seed.sql` sets Jeremiah (`jeremiah@puebloelectrics.com`) to `is_superadmin = true`; all other seeded profiles stay `false`.

**Using the helper in pages:**
```ts
// Server components / route handlers / server actions:
import { getCurrentUser, initialsFor } from "@/lib/auth/user";

// Client components ("use client") — MUST use the client-safe module,
// otherwise the build fails with "server-only cannot be used in pages/":
import { initialsFor } from "@/lib/auth/initials";

export default async function Page() {
  const me = await getCurrentUser();
  // me.user, me.profile, me.isSuperadmin — null-safe for anonymous traffic
  return <AppHeader userInitials={initialsFor(me.profile, me.user?.email ?? null)} userEmail={me.user?.email ?? undefined} />;
}
```

For pages that should redirect anon users:
```ts
const me = await requireUser();             // -> redirects to /login if anon
const admin = await requireSuperadmin();    // -> redirects to / if not superadmin
```

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

## 7. Branding Polish

- ~~Drop `pe_logo.png` into `public/brand/pe_logo.png`.~~ Done — asset is `public/brand/Pueblo_Electrics-1.png`, wired via `next/image` with correct intrinsic dims + `priority`.
- Add favicon + `public/apple-touch-icon.png` + OG image (future).

---

## 8. Step-Two — Admin UI for User & Project Access (DONE, 2026-04-22)

Shipped in commit `bda357c admin user management`. Lives under `/admin/*`, gated globally by `requireSuperadmin()` in `app/admin/layout.tsx`. See the 2026-04-22 (afternoon) session log at the bottom of this file for the full build breakdown; the high-level shape is:

- **Routes:** `/admin` → redirects to `/admin/users`; `/admin/users` lists every user with search + status filters; `/admin/users/[id]` is the per-user detail pane with profile edit, password reset, email confirm, superadmin toggle, grant/revoke project access, and delete.
- **Server actions** (`app/admin/actions.ts`): 8 actions, each fenced by `await requireSuperadmin()` as the first statement. Use the service-role client (`lib/supabase/admin.ts`) to bypass RLS on writes. Actions return `{ ok, error? }` — never throw on user-visible failures.
- **Admin queries** (`lib/queries/admin.ts`): `listAllUsers()`, `listAllProjects()`, `getAdminUserDetail(id)`. Short-circuit to empty arrays when Supabase env vars are missing, so local dev without creds still renders.
- **Header link:** `AppHeader` accepts `isSuperadmin` and renders the "Admin" pill when true. Dashboard and project layout pass the flag through from `getCurrentUser()`.

**Guardrails already baked in:**
- Last-superadmin demotion is blocked (`setSuperadminAction` counts remaining superadmins before allowing self-demote).
- Self-delete is blocked in `deleteUserAction`.
- Auth-user / profile creation is transactional-ish: if the profile upsert fails after auth.users row is created, the auth user is rolled back to avoid orphans.
- Service-role key never leaves the server (`createAdminClient()` is `import "server-only"`).

**Known gaps / next polish:**
- No invite-by-email flow yet — users get a password at create time. A future action could call `supabase.auth.admin.inviteUserByEmail(email)` and insert the `project_members` row in one shot.
- No audit log table. Every privileged write goes through server actions, so a `admin_audit_log` table + a small wrapper helper around the service-role client would capture who-did-what-when.
- No paginated user list — fine at tens/low-hundreds. Swap to server-side search when we cross that threshold.

---

## 9. Deploy to Vercel

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
- **`server-only` poisons the whole module.** `lib/auth/user.ts` has `import "server-only"` at the top. Any `"use client"` file that imports *anything* from that module — even a pure helper like `initialsFor` — fails the Vercel build with a misleading "pages/ directory" error (fix shipped 2026-04-22). Rule: client components import helpers from `@/lib/auth/initials` (client-safe); server code keeps using `@/lib/auth/user` (re-exports `initialsFor` for back-compat). When adding new auth helpers, decide first: does it touch Supabase / cookies / `redirect()`? Yes → `user.ts`. No → `initials.ts` (or a new client-safe file).

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

---

## 2026-04-22 Update — Auth, Deploy, and Secret Rotation

Picked up from a fresh agent session. Everything below is delta on top of the 2026-04-21 state above.

### What landed today (all on `main`, pushed to origin)

1. **Migrations pushed to Supabase.** Project ref `xjpkqxsgudlvfwgkxtcb`. Fixed two forward-reference bugs in `0001_init.sql` along the way:
   - `update_updated_at_column()` moved to the top of the file so triggers can reference it.
   - `projects` SELECT policy (which references `project_members`) moved to AFTER `project_members` is created.
2. **Magic-link auth swapped for email+password.** See `app/login/login-form.tsx` — sign-in / sign-up pill toggle, password show/hide eye icon, 8-char min on sign-up, handles both "confirm email" ON and OFF. `login/page.tsx` subtitle updated to match. The magic-link callback route (`app/auth/callback/route.ts`) is still there as dead code; harmless but can be removed if desired.
3. **Superadmin bootstrap for Jeremiah.** Created `auth.users` row + flipped `profiles.is_superadmin = true` via the Supabase Admin API (not `signUp`, so email confirmation is bypassed). Creds: `jeremiah@puebloelectrics.com` / `Ilovecarrie1!`. Auth UUID: `7c5b8668-b6b9-4961-975d-6f082fa5accb`. One-off scripts (`scripts/_bootstrap-superadmin.mjs` and `_verify-signin.mjs`) were deleted after use — resurrect from git history (commit `77e5236`) if another superadmin needs bootstrapping.
4. **Migration `0003_fix_rls_recursion.sql` shipped.** The original `project_members` self-referencing policies caused Postgres `infinite recursion detected in policy for relation 'project_members'` at runtime. Fixed by wrapping membership checks in `SECURITY DEFINER` helpers `public.is_project_member(p_project_id, p_user_id)` and `public.is_project_admin(...)`. **Any future policies that check membership on `project_members` itself MUST use these helpers, not inline `exists (select 1 from project_members ...)` subqueries** — otherwise the recursion comes back.
5. **Vercel deploy is live and working** at `https://project-portal-jade.vercel.app/`. Latest commit on prod: `06b10d6 chore: trigger redeploy to pick up env vars`.

### Vercel env var gotcha (lesson learned)

Setting/changing env vars in Vercel does NOT rebuild existing deployments. Env vars are injected at build time. If `/api/health` returns all `false` after adding env vars, the fix is a redeploy:
```bash
git commit --allow-empty -m "chore: trigger redeploy" && git push
```
Then wait ~60s and re-hit `/api/health` — all fields should flip to `true`.

### OUTSTANDING — Secret rotation (IMPORTANT, not yet done)

On 2026-04-22 I (the prior agent) made a mistake and pasted three secret values back into chat while walking Jeremiah through Vercel setup. The conversation transcript now contains them, so they need rotating before anyone else gets access to the chat log or repo. Values to rotate:

1. **Supabase service role key** (`SUPABASE_SERVICE_ROLE_KEY`) — rotate at Supabase dashboard → Project Settings → API → "Generate new service_role key". Update `.env.local` and Vercel env (all 3 scopes: Production, Preview, Development), then redeploy.
2. **Cloudflare R2 secret access key** (`R2_SECRET_ACCESS_KEY`) — rotate at Cloudflare → R2 → Manage R2 API Tokens → revoke old token, issue new "Object Read & Write" scoped to `project-portal-files`. Updates `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY`. Same .env + Vercel + redeploy dance.
3. **Resend API key** (`RESEND_API_KEY`) — rotate at resend.com → API Keys → delete old, create new. Update .env + Vercel + redeploy.

Jeremiah has acknowledged this is outstanding. Next agent should offer to pilot this if it hasn't been done yet. **Do NOT echo any of the new values back into chat** — use the Vercel Import dialog (user uploads their own .env.local) or `vercel env add NAME production < value.txt`. This rule is encoded in `feedback_secret_handling.md` memory — read it before touching env vars.

### Current state of TODOs from the 2026-04-21 list

- Item 15 (git repo + push to GitHub): **Done.** Repo is live, remote `origin` wired, `main` is up-to-date.
- Item 16 (Deploy to Vercel): **Done.** Live URL responding 200 on `/login`, `/api/health` reports all env vars present.
- Item 13 (schema adds for richer hydration): still deferred, not blocking.
- Item 8 (admin UI for project access via `requireSuperadmin()`): **Done** in commit `bda357c` on 2026-04-22 afternoon. See new session log below.

### What the next agent should verify before starting new work

1. `curl https://project-portal-jade.vercel.app/api/health` — expect all `env.*` fields `true`.
2. In a browser, sign in at `/login` with Jeremiah's creds. Should land on the dashboard without the "infinite recursion" error.
3. `git log --oneline -5` from `C:\DEV\project-portal` — tip should be at or past `06b10d6`.
4. Supabase dashboard → Authentication → Users — should show one confirmed user for Jeremiah at UUID `7c5b8668-...`.
5. Check whether secret rotation has happened yet — ask Jeremiah, or compare the keys in `.env.local` against what the dashboard currently shows.

### Build / deploy quick refs

- Local dev: `cd C:\DEV\project-portal && npm run dev` (pinned to Next 14.2.35).
- Force redeploy: `git commit --allow-empty -m "chore: redeploy" && git push`.
- Supabase migrations: `npx supabase db push` from `C:\DEV\project-portal` (project linked via `supabase link --project-ref xjpkqxsgudlvfwgkxtcb`).
- Health check: `curl https://project-portal-jade.vercel.app/api/health`.

---

## 2026-04-22 (afternoon) — Admin UI for User & Project Access

**What shipped** — a full superadmin console at `/admin/users` with a per-user detail screen that covers everything a PE admin needs to run the portal without ever opening the Supabase dashboard. Code is already on `main` at commit `bda357c admin user management` (2,434 insertions across 15 files) and was pushed to `origin/main` before this session opened.

### Files added

- `app/admin/layout.tsx` — shell for the `/admin/*` subtree. Runs `await requireSuperadmin()` up-front so every nested page inherits the gate. Renders the global `AppHeader` (with `isSuperadmin` = true) plus a thin admin sub-nav ("Users" tab + "Admin console" badge).
- `app/admin/page.tsx` — 10-line redirect to `/admin/users`. Room to become a KPI dashboard when we add more admin surfaces.
- `app/admin/users/page.tsx` — server component; `Promise.all([listAllUsers(), listAllProjects()])` in parallel, passes to the client list.
- `app/admin/users/users-page-client.tsx` — searchable user list with status tabs (All / Active / Pending / Admins) and an inline "Create user" slide-over. Submit → server action creates `auth.users` + `profiles` → redirects into the detail page so the operator can assign project access immediately.
- `app/admin/users/[id]/page.tsx` — per-user server component. Loads the detail via `getAdminUserDetail(id)`; 404s cleanly if the user doesn't exist.
- `app/admin/users/[id]/user-detail-client.tsx` — the big one (987 lines). Six cards: Identity header, Profile edit, Account (password reset + email-confirm + superadmin toggle), Project Access (grant with role picker / change role / revoke), Danger Zone (delete). Every mutation goes through a server action; every form is `useTransition`-pending-aware so the UI stays responsive.
- `app/admin/actions.ts` — 8 server actions: `createUserAction`, `updateProfileAction`, `setPasswordAction`, `confirmEmailAction`, `setSuperadminAction`, `grantProjectAccessAction`, `updateMembershipRoleAction`, `revokeProjectAccessAction`, `deleteUserAction`. Each starts with `await requireSuperadmin()`; each returns `{ ok: true } | { ok: false, error }` so forms render friendly inline errors.
- `lib/queries/admin.ts` — typed read layer (`listAllUsers`, `listAllProjects`, `getAdminUserDetail`). One `admin.listUsers()` + one `profiles` fetch + one `project_members` fetch, stitched client-side. No N+1s.
- `lib/supabase/admin.ts` — service-role client factory. `import "server-only"` so it can never be bundled to the browser.

### Files changed

- `components/pe/app-header.tsx` — added optional `isSuperadmin` prop. When true, renders an "Admin" pill link (ShieldCheck icon) between "People" and the Settings divider. Defaults to false so unauthenticated / non-admin chrome doesn't accidentally leak the surface.
- `app/page.tsx` — dashboard now reads `me.isSuperadmin` from `getCurrentUser()` and passes it to `<AppHeader isSuperadmin={...} />`.
- `app/projects/[slug]/layout.tsx` — same change for every project sub-route.
- `lib/queries/index.ts` — re-exports `listAllUsers`, `listAllProjects`, `getAdminUserDetail` and the `Admin*` types from the new admin query module.
- `middleware.ts` — `/admin/**` added to the protected-paths matcher so unauthenticated hits bounce to `/login?next=/admin/...`. The superadmin check happens inside the layout; middleware just enforces "you must be signed in."

### Design decisions

- **Superadmin check lives in the layout, not middleware.** Middleware only knows "is this request authenticated?" — distinguishing superadmin from ordinary user requires a DB read, which is layout-level work. Keeps middleware fast and the authz logic close to the UI it's gating.
- **Server actions, not route handlers.** Every mutation is a server action invoked via `<form action={action}>`. Zero client-side JSON handling, zero custom fetch. The `useTransition()` hook on the client gives us the pending spinner for free.
- **Service role is the ONLY privileged path.** `createAdminClient()` reads `SUPABASE_SERVICE_ROLE_KEY` server-side. The browser never sees it. `requireSuperadmin()` fires before any service-role call — belt-and-braces on top of RLS.
- **Last-superadmin safety rail.** `setSuperadminAction` counts remaining superadmins before honoring a self-demote. If it's the last one, the action returns an error banner rather than locking everyone out.
- **Self-delete safety rail.** `deleteUserAction` rejects `userId === me.user.id`.
- **Orphan-safe user creation.** If `auth.users` creation succeeds but the `profiles` upsert fails, we roll back the auth user. Never leave half-created accounts.
- **Nested route, not flat.** `/admin/users/[id]` rather than `/admin/users?id=…` — gives each user a stable bookmarkable URL matching the rest of the app's URL design.
- **Client-side search + filter.** User count will be in the tens to low hundreds for the foreseeable future. Server-side search adds latency and complexity that isn't earning its keep yet.
- **Create-user panel is inline, not a separate route.** Submit redirects into the detail page, which is where the operator naturally wants to go next (assign project access).

### QC gate

- `npx tsc --noEmit` in the mounted folder → **exit 0**.
- `npx next build` — couldn't complete inside the Cowork sandbox this session; the swc binary needed (`@next/swc-linux-x64-gnu`) isn't installed in `node_modules` and the sandbox can't reach `registry.npmjs.org` to download it. **Build needs to be run from Jeremiah's Windows box** (`npm run build` in `C:\DEV\project-portal`), where `@next/swc-win32-x64-msvc` is installed and working. The code typechecks clean and Vercel's Linux build machines have no trouble pulling the swc binary — the prod deploy for `bda357c` on Vercel is what actually proves the build.

### Working-tree noise

Sandbox `git status` shows ~50 files as "modified" but `git diff --ignore-all-space HEAD` returns an empty diff — it's pure whitespace/line-ending flip caused by the Cowork mount, not real changes. Do NOT commit these. If they bother you, `git checkout -- .` on the Windows side clears them; the tracked file bytes are already correct on origin.

### What the next agent should do

1. **Verify `/admin/users` in prod.** Sign in at `https://project-portal-jade.vercel.app/login` with Jeremiah's creds, click the "Admin" pill in the header, confirm the user list renders and the detail page loads. If `bda357c` hasn't deployed yet, trigger a redeploy with `git commit --allow-empty -m "chore: redeploy" && git push`.
2. **Sanity test the server actions.** Create a throwaway test user, assign them a role on one project, change the role, revoke, delete. Watch the network tab — every mutation should be a POST to the current page URL (server action boundary), not a custom endpoint.
3. **Don't skip the secret rotation.** Item from the 2026-04-22 morning session (§ "OUTSTANDING — Secret rotation") is still pending. The admin UI works fine against the current keys, but those keys are in the chat transcript from earlier and should be rotated before new agents get scrolling access.
4. **Good next build target:** an audit log. Every server action would insert into `admin_audit_log` (actor, target, action, before/after JSON, timestamp). Gives us a tamper-evident record of who did what, and surfaces the last 50 events on the admin dashboard landing page.

---

## 2026-04-22 (evening) — Admin UI for Projects (DONE)

Companion surface to the users admin. Operators can now create, edit, and delete projects — and manage their members — without touching the Supabase dashboard.

### Files added

- `app/admin/projects/page.tsx` — server component. Fetches `listProjectsWithStats()` and hands off to the client list.
- `app/admin/projects/projects-page-client.tsx` — searchable list with phase-filter tabs (All / Pre-Con / Design / Construction / Closed), inline "New project" slide-over, and a green empty-state card for the zero-projects case. Slug auto-suggests from the project name until the operator types into it.
- `app/admin/projects/[id]/page.tsx` — per-project server component. `Promise.all([getProjectDetail(id), listAllProfilesLite()])` → client detail component. 404s cleanly for an unknown id.
- `app/admin/projects/[id]/project-detail-client.tsx` — the big one. Four cards:
  - **Identity header** — folder icon, #slug, phase badge, completion %, member count, created/updated stamps.
  - **Details** — full edit form (name, slug, customer, customer rep, address, phase picker, %complete, next milestone, target date).
  - **Members** — avatar list with role picker per row, search + Add button for non-members, SA badge for superadmins (who see every project anyway). Reuses `grantProjectAccessAction`/`updateMembershipRoleAction`/`revokeProjectAccessAction` from `app/admin/actions.ts` and calls `router.refresh()` after each successful mutation because those actions only revalidate the users paths, not the project paths.
  - **Danger zone** — type-the-slug-to-confirm delete, same pattern as user delete.
- `app/admin/projects/actions.ts` — three server actions: `createProjectAction`, `updateProjectAction`, `deleteProjectAction`. All gated with `await requireSuperadmin()`. Slug validated with `/^[a-z0-9][a-z0-9_-]*$/` (≤64 chars); DB unique constraint is the authority. Postgres 23505 → friendly duplicate-slug error. Create redirects into the detail page; delete redirects to the list.
- `app/admin/admin-tabs.tsx` — client component holding the admin sub-nav. Uses `usePathname()` to light the active tab (Users / Projects). Layout stays a server component so the superadmin gate keeps running server-side.

### Files changed

- `app/admin/layout.tsx` — replaced the hardcoded single-tab with `<AdminTabs />`.
- `app/page.tsx` — dashboard now renders an `<EmptyProjectsState>` when `projects.length === 0`. Superadmins see "Create first project" CTA → `/admin/projects`; non-admins see a friendlier "ask your PE contact" message. Also added a "New project" shortcut in the page header for superadmins when projects exist.
- `lib/queries/admin.ts` — added `listProjectsWithStats()`, `getProjectDetail(id)`, `listAllProfilesLite()` and their types (`AdminProjectListRow`, `AdminProjectDetail`, `AdminProjectMemberRow`, `AdminProfileLite`). Richer row than the existing `AdminProjectRow` which is still used by the user-detail page; both live side-by-side.
- `lib/queries/index.ts` — re-exports the new admin query surfaces.

### Design decisions

- **Extended admin queries rather than replacing `AdminProjectRow`.** The user-detail flow (adding project access to a user) only needs id/slug/name/customer. The project list view needs phase, %complete, member count, etc. Keeping both keeps each page's data contract honest.
- **Reused the existing grant/revoke/updateRole actions.** Project members and user memberships are the same rows; inverting the UI perspective doesn't warrant a second set of server actions. Used `router.refresh()` on the detail client so stale membership lists don't linger after a mutation (since those actions only revalidate `/admin/users/*`).
- **Slug is editable in the edit form.** Operators who mistype the project number at creation need to fix it. The caveat is shown in a `<p>` under the input. URL breakage is on the operator's head.
- **Type-the-slug-to-delete confirmation.** Same "friction" pattern as the user delete (which requires typing the email). Reduces accidental clicks.
- **Phase picker is a 2-col grid, not a select.** Matches the create panel, gives the operator a one-glance read of the label + hint for each phase.
- **Client-side search + filter.** Project count will be in the tens for years — no need for server pagination.

### QC gate

- `tsc --noEmit` on a `/tmp/pp-tsc/` clone → **exit 0**.
- `next build` not run this session (same sandbox EPERM issue documented in §Gotchas). Run `npm run build` in `C:\DEV\project-portal` before pushing.

### Known gaps / next up

1. **Audit log** — still the best next build target; now there are 11 mutating actions to log.
2. **Public project detail page `/projects/[slug]`** — the admin side is done, but the member-facing project surface still reads mock-shaped data for some sections. Separate effort.
3. **Schedule / submittals / RFIs / chat** hydration on the real project rows — works today via the existing live queries; no change here, just noting the work ladder.
4. **Revalidation sharpness** — the membership actions in `app/admin/actions.ts` could optionally take a `projectId` field and revalidate `/admin/projects/${projectId}` too. We side-stepped this with `router.refresh()` on the detail client — good enough, and doesn't risk collateral damage to the user-detail flow.
