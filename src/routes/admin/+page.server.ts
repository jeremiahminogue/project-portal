import { listAdminProjects, listAdminUsers } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [projects, users] = await Promise.all([listAdminProjects(), listAdminUsers()]);
  return { projects, users };
};
