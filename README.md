# project-portal

The real Next.js 14 app for Pueblo Electric's customer-facing Project Portal. Scaffolded from the concept + mockup in the parent folder.

**Status (2026-04-21):** Full scaffold, 13 routes, clean build. All pages read through a hydrated live query layer (`@/lib/queries/*`) with mock fallback for dev. End-to-end file upload (R2 presigned PUT + DB record). Magic-link auth wired. PE logo dropped. Ready for `supabase db push && npm run build && vercel deploy`.

---

## Quickstart

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.local.example .env.local
# then paste Supabase + R2 + Resend creds — see HANDOFF.md for where each value comes from

# 3. Run
npm run dev
# → http://localhost:3000
```

Out of the box (no env vars) the app compiles and the screens render because every page uses typed mock data from `data/`. Auth/real-DB flows start when `.env.local` is populated and `supabase db push` is run.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | Next.js ESLint |
| `npm run type-check` | `tsc --noEmit` — catches TS errors without a full build |

---

## Layout

```
project-portal/
├── app/                          # Next.js 14 App Router
│   ├── layout.tsx                # Root: <html>, fonts, globals.css
│   ├── globals.css               # Tailwind + PE semantic tokens + glass utilities
│   ├── page.tsx                  # Projects Dashboard (/)
│   └── projects/[slug]/
│       ├── layout.tsx            # AppHeader + ProjectHeader + ProjectNav wrapper
│       ├── page.tsx              # Project Home
│       ├── files/page.tsx
│       ├── schedule/page.tsx
│       ├── submittals/page.tsx
│       ├── chat/page.tsx
│       ├── updates/page.tsx
│       └── directory/page.tsx
├── components/
│   ├── ui/                       # shadcn-style primitives (Button, Card, Badge, Tabs…)
│   └── pe/                       # PE-branded components (AppHeader, ProjectHeader, StatusChip…)
├── data/                         # Typed seed data extracted from the HTML mockup
│   ├── types.ts                  # shared interfaces
│   ├── projects.ts, schedule.ts, submittals.ts, files.ts, chat.ts, updates.ts, directory.ts
│   └── index.ts
├── lib/
│   ├── utils.ts                  # cn(), formatDate, relativeTime, initials
│   └── supabase/
│       ├── client.ts             # Browser client (createBrowserClient)
│       └── server.ts             # Server client (createServerClient + cookies)
├── supabase/
│   ├── migrations/0001_init.sql  # 12 tables, 5 enums, 30 RLS policies
│   ├── seed.sql                  # CSF #1646 starter data
│   └── README.md                 # How to init/link/push/seed
├── public/brand/                 # `Pueblo_Electrics-1.png` wordmark (wired into PELogo)
├── tailwind.config.ts            # PE colors (pe-green, pe-charcoal, …) + 16px radius
├── tsconfig.json                 # Strict mode, @/ alias
├── next.config.mjs
└── .env.local.example            # Every env var documented in place
```

---

## Stack at a Glance

| Layer | Choice | Where it shows up |
|---|---|---|
| Framework | Next.js 14 App Router + TS | `app/**` |
| Styling | Tailwind + shadcn primitives | `tailwind.config.ts`, `components/ui` |
| Database | Supabase Postgres | `supabase/migrations/0001_init.sql` |
| Auth | Supabase Auth (magic link) | `lib/supabase/{client,server}.ts` — wrapping ready; login page TBD |
| Files | Cloudflare R2 (S3-compatible) | `files` table stores `storage_key`; upload route TBD |
| Realtime | Supabase Realtime | `chat_messages` table ready; subscribe from `app/projects/[slug]/chat` |
| Email | Resend | `RESEND_*` env vars wired, client TBD |
| Hosting | Vercel | — |

---

## Design Tokens

PE colors live in `tailwind.config.ts` and are mapped to semantic tokens in `app/globals.css`:

```
pe-green:     #1DAF3F   (primary)
pe-green-dark: #18923A
pe-charcoal:  #3C3C3C   (dark text)
pe-body:      #2D2D2D   (body text)
pe-sub:       #6B6B6B   (muted)
```

Glass utilities: `.glass`, `.glass-strong`, `.accent-band`, `.surface-subtle`.

---

## What's Mock vs. Real

- **Real (live):** every page reads from `@/lib/queries/*`. When `NEXT_PUBLIC_SUPABASE_URL` is set, queries hit Supabase with joined profiles/routing/chat data in single PostgREST round-trips. When it's unset, the same functions short-circuit to `data/*.ts` — dev works without a DB.
- **Real + user-gated:** magic-link auth, R2 direct-upload (presigned PUT + `POST /api/files` to record the row), project membership gating on every write.
- **Not yet real:** reactions, attachments metadata, per-update comments/likes, chat unread counts, chat subject descriptions. Pages render fine without them; they need follow-up schema.

See `HANDOFF.md` for the exact next-steps checklist, and `GET /api/health` after deploy to confirm env vars landed.

---

## Notes for Future Agents / Engineers

- **Strict TS.** No `any` anywhere in the source. Keep it that way.
- **Server components by default.** Only add `"use client"` when you need state, effects, or event handlers. The whole app currently renders as server components except for Radix primitives that need it internally.
- **Imports use `@/`** — configured in `tsconfig.json`. Never use `../../` relative imports.
- **Dates are ISO strings** (`"2026-04-22"`) throughout — parse with `new Date(iso)`. This matches what Postgres will return.
- **Status chips** are normalized through `StatusChip` + `statusToColor` in `components/pe/status-chip.tsx`. If you add a new status, add it there — don't hardcode colors in pages.
- **Sandbox gotcha:** when installing inside the Cowork workspace folder, you'll see EPERM warnings on `npm install` cleanup and `next build` post-success. The build actually succeeds. Verified on 2026-04-21 by copying to `/tmp` and building cleanly.
