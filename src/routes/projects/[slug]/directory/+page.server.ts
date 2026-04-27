import { getDirectory, getProject } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [project, directory] = await Promise.all([getProject(event, event.params.slug), getDirectory(event, event.params.slug)]);
  return { project, directory };
};
