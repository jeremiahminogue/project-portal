import { PageShell } from "@/components/pe/page-shell";
import { listAllUsers, listAllProjects } from "@/lib/queries";
import { UsersPageClient } from "./users-page-client";

/**
 * Admin → Users.
 *
 * Server component that loads every user + every project in parallel, then
 * hands them to a single client component that owns search/filter/create
 * state. We co-locate everything in one client component so that the
 * "Create user" dialog can optimistically insert into the visible list
 * after the server action redirects into the detail page — no extra
 * round-trips.
 */
export default async function AdminUsersPage() {
  const [users, projects] = await Promise.all([
    listAllUsers(),
    listAllProjects(),
  ]);

  return (
    <PageShell className="py-6">
      <UsersPageClient users={users} projects={projects} />
    </PageShell>
  );
}
