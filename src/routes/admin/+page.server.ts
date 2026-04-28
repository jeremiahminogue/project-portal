import { requireSuperadmin } from '$lib/server/auth';
import { listAdminAuditLogs, listAdminProjects, listAdminUsers } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  await requireSuperadmin(event);
  const [projects, users, auditLogs] = await Promise.all([
    listAdminProjects(),
    listAdminUsers(),
    listAdminAuditLogs(12)
  ]);
  return { projects, users, auditLogs };
};
