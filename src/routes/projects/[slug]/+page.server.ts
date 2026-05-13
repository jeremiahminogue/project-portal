import {
  getDirectory,
  getFiles,
  getRfis,
  getSchedule,
  getSubmittals
} from '$lib/server/queries';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const slug = event.params.slug;
  const [schedule, submittals, rfis, files, directory] = await Promise.all([
    getSchedule(event, slug),
    getSubmittals(event, slug),
    getRfis(event, slug),
    getFiles(event, slug),
    getDirectory(event, slug)
  ]);
  return { schedule, submittals, rfis, files, directory };
};
