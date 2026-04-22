import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase admin client.
 *
 * Uses the SERVICE ROLE key. Bypasses Row-Level Security. NEVER expose this
 * client (or the key) to the browser. It is only safe to import from:
 *   - Server Components that gate with `requireSuperadmin()`
 *   - Route handlers that gate auth themselves
 *   - Server actions that gate auth themselves
 *
 * The `admin` namespace on the returned client (`.auth.admin.*`) is the only
 * way to create / delete / password-reset users without their consent — it's
 * what the /admin/users page leans on.
 *
 * We don't persist a session on this client (`persistSession: false`) because
 * it represents Pueblo Electric itself, not any particular person. Each call
 * is a one-off privileged operation.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client unavailable: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
