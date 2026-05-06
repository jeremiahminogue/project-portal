import { getProjects } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [projects, me] = await Promise.all([getProjects(event), event.locals.getCurrentUser()]);
  return {
    projects,
    me,
    canCreateProjects: Boolean(me.isSuperadmin || me.profile?.role === 'admin')
  };
};
