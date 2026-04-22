import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/pe/page-shell";
import { getProjectDetail, listAllProfilesLite } from "@/lib/queries";
import { ProjectDetailClient } from "./project-detail-client";

/**
 * Admin → Projects → Detail.
 *
 * Server component. Pulls the project detail + the slim profile list (for
 * the "add member" picker) in parallel, then hands everything to the client
 * component which owns the edit/grant/revoke UI.
 *
 * 404s when the id doesn't resolve. This surface is superadmin-only (the
 * admin layout enforces it), so there's no distinction between "not found"
 * and "not allowed to see" from the user's perspective.
 */
export default async function AdminProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [detail, profiles] = await Promise.all([
    getProjectDetail(params.id),
    listAllProfilesLite(),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <PageShell className="py-6">
      <div className="mb-4">
        <Link
          href="/admin/projects"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-pe-body"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to projects
        </Link>
      </div>
      <ProjectDetailClient detail={detail} allProfiles={profiles} />
    </PageShell>
  );
}
