import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Import this in client components and
 * client-side hooks. Never use in server code — use the server client instead.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
