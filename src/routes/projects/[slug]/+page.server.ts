import {
  getDirectory,
  getFiles,
  getRfis,
  getSchedule,
  getSubmittals,
  getUpdates
} from '$lib/server/queries';
import { fail } from '@sveltejs/kit';
import { formString } from '$lib/server/auth';
import {
  databaseClientForProjectAccess,
  isProjectAccessError,
  projectRoleCapabilities,
  requireProjectAccess,
  type ProjectRole
} from '$lib/server/project-access';
import type { Actions, PageServerLoad } from './$types';

const projectPhases = new Set(['pre_con', 'design', 'construction', 'closeout']);

function percentValue(value: string) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return null;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function dateValue(value: string) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

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
  const access = event.locals.supabase ? await requireProjectAccess(event, slug) : null;
  const role = access && !isProjectAccessError(access) ? (access.role as ProjectRole) : null;

  return {
    schedule,
    submittals,
    rfis,
    files,
    updates,
    directory,
    progressAccess: {
      canEdit: role ? projectRoleCapabilities[role].canEditProjectProgress : false
    },
    photoAccess: {
      canUpload: role ? projectRoleCapabilities[role].canUploadFiles : false
    }
  };
};

export const actions: Actions = {
  updateProgress: async (event) => {
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member'],
      action: 'update project progress'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });

    const client = databaseClientForProjectAccess(event, access);
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const form = await event.request.formData();
    const phase = formString(form, 'phase');
    const percent = percentValue(formString(form, 'percentComplete'));
    const nextMilestone = formString(form, 'nextMilestone');
    const nextMilestoneDate = dateValue(formString(form, 'nextMilestoneDate'));

    if (!projectPhases.has(phase)) return fail(400, { error: 'Choose a valid project status.' });
    if (percent === null) return fail(400, { error: 'Completion must be a number from 0 to 100.' });
    if (nextMilestoneDate === undefined) return fail(400, { error: 'Use a valid milestone date.' });

    const { error } = await client
      .from('projects')
      .update({
        phase,
        percent_complete: percent,
        next_milestone: nextMilestone || null,
        next_milestone_date: nextMilestoneDate
      })
      .eq('id', access.project.id);

    if (error) return fail(400, { error: error.message });
    return { ok: true, saved: 'Project progress updated.' };
  }
};
