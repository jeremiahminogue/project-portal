import { error } from '@sveltejs/kit';
import { getProject, getProjects } from '$lib/server/queries';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const [project, projects] = await Promise.all([getProject(event, event.params.slug), getProjects(event)]);
  if (!project) throw error(404, 'Project not found');
  return {
    project,
    projects,
    slug: event.params.slug,
    me: await event.locals.getCurrentUser()
  };
};
