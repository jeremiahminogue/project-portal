import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /auth/signout
 *
 * Clears the Supabase session cookie and redirects to /login.
 * Must be POST (not GET) so bots/prefetch don't accidentally log users
 * out via a crawled link.
 *
 * Call it from a <form method="post" action="/auth/signout"> button,
 * or from a client component via fetch("/auth/signout", { method: "POST" }).
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const url = new URL("/login", request.url);
  return NextResponse.redirect(url, { status: 303 }); // 303 = POST → GET
}
