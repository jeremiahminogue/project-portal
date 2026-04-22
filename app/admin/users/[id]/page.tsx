import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/pe/page-shell";
import { listAllProjects, getUserDetail } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth/user";
import { UserDetailClient } from "./user-detail-client";

/**
 * Admin → Users → Detail.
 *
 * Server component. Fetches the user + the full project list in parallel so
 * the client-side UI has everything it needs to show project toggles
 * without a follow-up round-trip. All mutations happen via server actions
 * in `app/admin/actions.ts`.
 *
 * 404s when the id doesn't resolve — this is a superadmin surface, so we
 * don't need to distinguish "not found" from "not allowed to see".
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [detail, projects, me] = await Promise.all([
    getUserDetail(params.id),
    listAllProjects(),
    getCurrentUser(),
  ]);

  if (!detail) {
    notFound();
  }

  return (
    <PageShell className="py-6">
      <div className="mb-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-pe-body"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to users
        </Link>
      </div>
      <UserDetailClient
        detail={detail}
        allProjects={projects}
        isSelf={me.user?.id === detail.id}
      />
    </PageShell>
  );
}
