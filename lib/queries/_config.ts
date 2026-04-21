/**
 * Query layer config.
 *
 * USE_MOCK flips the whole query layer between `data/*.ts` mock sources and
 * live Supabase calls. Pages import from `lib/queries/*` and never know the
 * difference.
 *
 * Gate: NEXT_PUBLIC_SUPABASE_URL must be set for live mode. This keeps the
 * mock-data dev experience working out-of-the-box (no creds = no broken
 * screens) and matches the middleware's env-var guard.
 */
export const USE_MOCK = !process.env.NEXT_PUBLIC_SUPABASE_URL;
