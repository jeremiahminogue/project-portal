import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

/**
 * Auth gate for the Project Portal.
 *
 * Protects:
 *   - /projects and /projects/**
 *   - /directory
 *
 * Public:
 *   - /login
 *   - /auth/** (magic-link callback, sign-out)
 *   - Everything under /_next, /api public routes, static files
 *
 * Unauthenticated users are redirected to /login?next=<original path>
 * so we can bounce them back after they click the magic link.
 *
 * Notes:
 *   - Env-var guard: if Supabase env vars aren't set yet (local dev without
 *     `.env.local`, or a preview before secrets land) we let traffic through.
 *     This keeps the mock-data screens working until auth goes live, and
 *     prevents a broken redirect loop in CI/preview.
 */
export async function middleware(request: NextRequest) {
  // Env-var guard: no Supabase configured → let everything through.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next();
  }

  const { supabase, response } = createMiddlewareClient(request);

  // Refresh the session cookie (required by @supabase/ssr) and read user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Already signed in? Redirect /login to the dashboard.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Not signed in + hitting a protected path? Bounce to /login with ?next=.
  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return response;
}

function isProtectedPath(pathname: string): boolean {
  // Dashboard (/) is protected; all the project routes and directory too.
  if (pathname === "/") return true;
  if (pathname.startsWith("/projects")) return true;
  if (pathname.startsWith("/directory")) return true;
  return false;
}

export const config = {
  // Run the middleware on every route except static assets and Next internals.
  // `/api/auth/*` routes are intentionally included so auth cookies get
  // refreshed there too.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
