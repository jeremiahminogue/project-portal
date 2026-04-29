import { fail } from '@sveltejs/kit';
import { formOptional, formString } from '$lib/server/auth';
import { databaseClientForProjectAccess, isProjectAccessError, projectRoleCapabilities, requireProjectAccess } from '$lib/server/project-access';
import { getProject, getSchedule } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [project, schedule] = await Promise.all([getProject(event, event.params.slug), getSchedule(event, event.params.slug)]);
  const access = event.locals.supabase ? await requireProjectAccess(event, event.params.slug) : null;
  const role = access && !isProjectAccessError(access) ? access.role : null;
  return {
    project,
    schedule,
    scheduleAccess: {
      canManage: role ? projectRoleCapabilities[role].canManageSchedule : !event.locals.supabase,
      canDelete: role ? projectRoleCapabilities[role].canDeleteSchedule : !event.locals.supabase
    }
  };
};

function validStatus(value: string) {
  return ['green', 'amber', 'red', 'blue', 'gray', 'purple'].includes(value) ? value : 'blue';
}

export const actions: Actions = {
  saveActivity: async (event) => {
    const form = await event.request.formData();
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member'],
      action: 'manage schedule activities for this project'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });
    const client = databaseClientForProjectAccess(event, access);
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const id = formOptional(form, 'id');
    const title = formString(form, 'title');
    const phase = formString(form, 'phase');
    const startDate = formString(form, 'startDate');
    const endDate = formString(form, 'endDate');
    const percentComplete = Math.min(100, Math.max(0, Number(formString(form, 'percentComplete') || 0)));
    if (!title || !phase || !startDate || !endDate) return fail(400, { error: 'Title, phase, start, and end are required.' });
    if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
      return fail(400, { error: 'End date must be on or after the start date.' });
    }

    const values = {
      project_id: access.project.id,
      phase,
      title,
      activity_type: formString(form, 'activityType') || 'internal',
      start_date: startDate,
      end_date: endDate,
      owner: formOptional(form, 'owner'),
      status: validStatus(formString(form, 'status')),
      is_blackout: form.get('isBlackout') === 'on',
      percent_complete: percentComplete
    };

    const result = id
      ? await client.from('schedule_activities').update(values).eq('id', id).eq('project_id', access.project.id)
      : await client.from('schedule_activities').insert(values);
    if (result.error) return fail(400, { error: result.error.message });
    return { ok: true };
  },

  deleteActivity: async (event) => {
    const form = await event.request.formData();
    const id = formString(form, 'id');
    if (!id) return fail(400, { error: 'Choose an activity to delete.' });
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'delete schedule activities for this project'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });
    const client = databaseClientForProjectAccess(event, access);
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });
    const { error } = await client.from('schedule_activities').delete().eq('id', id).eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });
    return { ok: true };
  }
};
