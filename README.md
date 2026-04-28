# Project Portal

Pueblo Electric's SvelteKit/Svelte 5 project portal for owner/client access to project files, drawings, specs, submittals, RFIs, updates, chat, and directory information.

Production URL: `https://projectportal.puebloelectrics.com`

## Stack

- Svelte 5 + SvelteKit 2
- Vite 8
- Tailwind CSS 4
- Supabase Auth/Postgres/RLS
- Tigris or Cloudflare R2 S3-compatible object storage for uploads/downloads
- Same-origin browser PDF preview
- Resend email API via direct HTTPS calls
- Vercel adapter in Vercel, Node adapter for local Windows builds

## Run

```bash
npm install
npm run dev
```

The app is available at `http://127.0.0.1:5173`.

This repository also supports the Codex bundled Node runtime. If `npm` is not on PATH, use the local npm bootstrap in `.tools` as done by Codex, or install Node/npm normally.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Generate Tailwind CSS and start SvelteKit dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run check` | Svelte and TypeScript diagnostics |
| `npm run type-check` | TypeScript diagnostics |
| `npm test` | Production-hardening regression tests |
| `npm run ci` | Check, type-check, test, and build |
| `npm run styles` | Regenerate Tailwind CSS only |

## Environment

Existing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars are still supported. SvelteKit-native names are also supported:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TIGRIS_ENDPOINT`
- `TIGRIS_ACCESS_KEY_ID`
- `TIGRIS_SECRET_ACCESS_KEY`
- `TIGRIS_BUCKET`
- `TIGRIS_REGION`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_REGION`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `PUBLIC_SITE_URL` (`https://projectportal.puebloelectrics.com` in production)
- `PORTAL_MOCK_AUTH` (local-only; defaults on outside production)
- `PORTAL_FORCE_MOCK_AUTH` (local-only override for screenshots/testing)
- `PORTAL_ENABLE_LOCAL_SUPERADMIN` (local-only; keep false in production)
- `PORTAL_OCR_INLINE_MAX_BYTES`
- `PORTAL_OCR_TIMEOUT_MS`

With no Supabase env vars outside production, pages fall back to typed mock data from `src/lib/server/mock-data/` and a mock signed-in admin. In production, protected pages and file APIs fail closed if Supabase auth env vars are missing.

## App Surface

- `/login` password sign-in/sign-up with Supabase SSR cookies
- `/` project dashboard
- `/projects/[slug]` project overview
- `/projects/[slug]/files` searchable files, direct S3-compatible upload, streamed download, PDF preview
- `/projects/[slug]/submittals` submittal and RFI creation, assignment, status, decision/answer tracking
- `/projects/[slug]/schedule`
- `/projects/[slug]/updates` update publishing with optional team email
- `/projects/[slug]/chat`
- `/projects/[slug]/directory`
- `/admin`, `/admin/projects`, `/admin/users` for superadmins
- `/api/health` deployment smoke check

## Notes

Vercel builds use `@sveltejs/adapter-vercel`. Local builds use `@sveltejs/adapter-node` because the Windows sandbox blocks symlink creation used by the Vercel adapter.

`scripts/patch-vite-realpath.mjs` works around this workspace's Windows sandbox blocking Vite's `net use` realpath probe. It is safe and idempotent.
