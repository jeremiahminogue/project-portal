import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase client factory used inside Next.js middleware. Refreshes the
 * auth session cookie on every request so server components always see
 * an up-to-date session. Returns both the response (with any updated
 * cookies attached) and the client itself so the caller can make auth
 * checks (e.g., `supabase.auth.getUser()`) before deciding whether to
 * redirect.
 *
 * Usage:
 *   export async function middleware(req: NextRequest) {
 *     const { supabase, response } = createMiddlewareClient(req);
 *     const { data: { user } } = await supabase.auth.getUser();
 *     if (!user) return NextResponse.redirect(new URL("/login", req.url));
 *     return response;
 *   }
 */
export function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  return { supabase, response };
}
