import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPresignedUploadUrl, buildStorageKey } from "@/lib/r2";

/**
 * POST /api/files/upload-url
 *
 * Returns a short-lived presigned PUT URL the browser uploads directly to
 * Cloudflare R2. We never proxy file bytes through our server.
 *
 * Body:
 *   { projectSlug: string, filename: string, contentType: string, sizeBytes?: number }
 *
 * Response (200):
 *   { url, key, bucket }
 *
 * Auth:
 *   1. Must be a signed-in user (Supabase session cookie).
 *   2. Must be a project_members row for (project_id, user.id) with role
 *      admin|member (guests can view but not upload).
 *
 * The browser then does:
 *   await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": contentType } })
 *   // then POST /api/files to record the row in the files table with `key`
 */

interface UploadRequest {
  projectSlug: string;
  filename: string;
  contentType: string;
  sizeBytes?: number;
}

// Upper bound on file size accepted (hard stop before we hand out a URL).
// R2 supports far larger, but 100MB is sane for the doc/image flow we have.
const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // Parse + validate body
  let body: UploadRequest;
  try {
    body = (await req.json()) as UploadRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectSlug, filename, contentType, sizeBytes } = body;
  if (!projectSlug || typeof projectSlug !== "string") {
    return NextResponse.json({ error: "projectSlug required" }, { status: 400 });
  }
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }
  if (!contentType || typeof contentType !== "string") {
    return NextResponse.json({ error: "contentType required" }, { status: 400 });
  }
  if (sizeBytes !== undefined && (typeof sizeBytes !== "number" || sizeBytes > MAX_BYTES)) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }

  // Auth gate — Supabase session
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Membership gate — user must be admin|member on this project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: member, error: memberError } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", project.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }
  if (!member || !["admin", "member"].includes(member.role)) {
    return NextResponse.json(
      { error: "Not authorized to upload to this project" },
      { status: 403 },
    );
  }

  // Generate signed URL
  try {
    const key = buildStorageKey(projectSlug, filename);
    const signed = await createPresignedUploadUrl(key, contentType);
    return NextResponse.json(signed, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
