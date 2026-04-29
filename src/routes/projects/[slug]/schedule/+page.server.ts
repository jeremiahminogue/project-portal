import { fail } from '@sveltejs/kit';
import { formOptional, formString } from '$lib/server/auth';
import { databaseClientForProjectAccess, isProjectAccessError, projectRoleCapabilities, requireProjectAccess } from '$lib/server/project-access';
import { getProject, getSchedule } from '$lib/server/queries';
import { parseScheduleImport } from '$lib/server/schedule-import';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [project, schedule] = await Promise.all([getProject(event, event.params.slug), getSchedule(event, event.params.slug)]);
  const access = event.locals.supabase ? await requireProjectAccess(event, event.params.slug) : null;
  const role = access && !isProjectAccessError(access) ? access.role : null;
  return {
    project,
    schedule,
    todayIso: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' }),
    scheduleAccess: {
      canManage: role ? projectRoleCapabilities[role].canManageSchedule : !event.locals.supabase,
      canDelete: role ? projectRoleCapabilities[role].canDeleteSchedule : !event.locals.supabase
    }
  };
};

function validStatus(value: string) {
  return ['green', 'amber', 'red', 'blue', 'gray', 'purple'].includes(value) ? value : 'blue';
}

function missingScheduleMetadataColumn(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === '42703' ||
    /column .*predecessor_refs|column .*source_order|column .*source_wbs/i.test(error?.message ?? '')
  );
}

function withoutScheduleMetadata<T extends Record<string, unknown>>(values: T) {
  const { predecessor_refs, source_order, source_wbs, ...legacyValues } = values;
  void predecessor_refs;
  void source_order;
  void source_wbs;
  return legacyValues;
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
    const percentComplete = form.get('markComplete') === 'on'
      ? 100
      : Math.min(100, Math.max(0, Number(formString(form, 'percentComplete') || 0)));
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
      percent_complete: percentComplete,
      predecessor_refs: formOptional(form, 'predecessorRefs')
    };

    let result = id
      ? await client.from('schedule_activities').update(values).eq('id', id).eq('project_id', access.project.id)
      : await client.from('schedule_activities').insert(values);
    if (missingScheduleMetadataColumn(result.error)) {
      const legacyValues = withoutScheduleMetadata(values);
      result = id
        ? await client.from('schedule_activities').update(legacyValues).eq('id', id).eq('project_id', access.project.id)
        : await client.from('schedule_activities').insert(legacyValues);
    }
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
  },

  importSchedule: async (event) => {
    const form = await event.request.formData();
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member'],
      action: 'import schedule activities for this project'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });
    const client = databaseClientForProjectAccess(event, access);
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const file = form.get('scheduleFile');
    if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Choose a Microsoft Project PDF, XML, or CSV export.' });

    let activities;
    try {
      activities = await parseScheduleImport(file);
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not read that schedule export.' });
    }
    if (!activities.length) return fail(400, { error: 'No schedule activities were found in that export.' });

    const replaceSchedule = form.get('replaceSchedule') === 'on';
    if (replaceSchedule && !projectRoleCapabilities[access.role].canDeleteSchedule) {
      return fail(403, { error: 'Not authorized to replace this project schedule.' });
    }

    if (replaceSchedule) {
      const deleted = await client.from('schedule_activities').delete().eq('project_id', access.project.id);
      if (deleted.error) return fail(400, { error: deleted.error.message });
    }

    const rows = activities.map((activity) => ({
        project_id: access.project.id,
        phase: activity.phase,
        title: activity.title,
        activity_type: activity.activityType,
        start_date: activity.startDate,
        end_date: activity.endDate,
        owner: activity.owner,
        status: activity.status,
        is_blackout: activity.isBlackout,
        percent_complete: activity.percentComplete,
        source_order: activity.sourceOrder,
        source_wbs: activity.sourceWbs,
        predecessor_refs: activity.predecessorRefs
      }));

    let inserted = await client.from('schedule_activities').insert(rows);
    if (missingScheduleMetadataColumn(inserted.error)) {
      inserted = await client.from('schedule_activities').insert(rows.map((row) => withoutScheduleMetadata(row)));
    }
    if (inserted.error) return fail(400, { error: inserted.error.message });
    return { ok: true, imported: activities.length };
  }
};
