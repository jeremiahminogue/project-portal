import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback?code=...&next=/projects/...
 *
 * Target of the magic-link email. Supabase ships the user here with a
 * short-lived `code`. We trade it for a session cookie, then redirect
 * the user wherever they were originally heading (via the `next` param
 * that the /login page round-trips).
 *
 * Failure modes:
 *   - No code in the URL → user probably refreshed after landing.
 *     Bounce them back to /login.
 *   - exchangeCodeForSession errors → expired / reused / tampered.
 *     Bounce to /login with ?error=.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const next = isSafeNext(nextParam) ? nextParam! : "/";

  if (!code) {
    return redirectToLogin(origin, next, "Missing sign-in code. Request a new link.");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectToLogin(
      origin,
      next,
      error.message.toLowerCase().includes("expired")
        ? "That sign-in link expired. We'll send you a new one."
        : "Sign-in failed. Request a new link and try again.",
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}

/**
 * Only accept internal paths as ?next= targets. Blocks open-redirect
 * attacks where someone crafts `/login?next=https://evil.com`.
 */
function isSafeNext(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false; // protocol-relative
  return true;
}

function redirectToLogin(origin: string, next: string, message: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", message);
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
