import {
  getDirectory,
  getFiles,
  getRfis,
  getSchedule,
  getSubmittals,
  getUpdates
} from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const slug = event.params.slug;
  const [schedule, submittals, rfis, files, updates, directory] = await Promise.all([
    getSchedule(event, slug),
    getSubmittals(event, slug),
    getRfis(event, slug),
    getFiles(event, slug),
    getUpdates(event, slug),
    getDirectory(event, slug)
  ]);

  return { schedule, submittals, rfis, files, updates, directory };
};
