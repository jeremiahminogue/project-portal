import { getProject, getSchedule } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [project, schedule] = await Promise.all([getProject(event, event.params.slug), getSchedule(event, event.params.slug)]);
  return { project, schedule };
};
