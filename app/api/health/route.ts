import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Lightweight deploy sanity endpoint. Confirms the runtime is up and reports
 * which of the core environment variables are populated. Does **not** call
 * Supabase, R2, or Resend — we want this to be cheap and reliable even if one
 * of those services is having a bad afternoon.
 *
 * Response shape (always 200 — the request itself succeeding is the point):
 *   {
 *     ok: true,
 *     ts: ISO string,
 *     env: {
 *       supabase: { url: bool, anonKey: bool, serviceRole: bool },
 *       r2:       { endpoint: bool, accessKey: bool, secret: bool, bucket: bool },
 *       resend:   { apiKey: bool, from: bool },
 *       app:      { siteUrl: bool }
 *     }
 *   }
 *
 * We deliberately return booleans, not values — this endpoint is
 * unauthenticated and leaking a real endpoint URL or bucket name would be
 * mildly embarrassing. Presence is enough to unblock a deploy check.
 */

export const dynamic = "force-dynamic";

function has(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    env: {
      supabase: {
        url: has("NEXT_PUBLIC_SUPABASE_URL"),
        anonKey: has("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        serviceRole: has("SUPABASE_SERVICE_ROLE_KEY"),
      },
      r2: {
        endpoint: has("R2_ENDPOINT"),
        accessKey: has("R2_ACCESS_KEY_ID"),
        secret: has("R2_SECRET_ACCESS_KEY"),
        bucket: has("R2_BUCKET"),
        publicBase: has("R2_PUBLIC_BASE_URL"),
      },
      resend: {
        apiKey: has("RESEND_API_KEY"),
        from: has("RESEND_FROM"),
      },
      app: {
        siteUrl: has("NEXT_PUBLIC_SITE_URL"),
      },
    },
  });
}
