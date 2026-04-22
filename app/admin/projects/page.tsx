import { PageShell } from "@/components/pe/page-shell";
import { listProjectsWithStats } from "@/lib/queries";
import { ProjectsPageClient } from "./projects-page-client";

/**
 * Admin → Projects.
 *
 * Server component. Pulls every project with its member-count aggregate in
 * one query pair, hands the result to a client component that owns search
 * + filter + create state. Same pattern as /admin/users.
 */
export default async function AdminProjectsPage() {
  const projects = await listProjectsWithStats();

  return (
    <PageShell className="py-6">
      <ProjectsPageClient projects={projects} />
    </PageShell>
  );
}
