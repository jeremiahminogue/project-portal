import { error } from '@sveltejs/kit';
import { getProject } from '$lib/server/queries';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  const project = await getProject(event, event.params.slug);
  if (!project) throw error(404, 'Project not found');
  return {
    project,
    slug: event.params.slug,
    me: await event.locals.getCurrentUser()
  };
};
