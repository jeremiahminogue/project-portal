import { fail } from '@sveltejs/kit';
import { actionError, formOptional, formString } from '$lib/server/auth';
import { notifyProjectEvent } from '$lib/server/notifications';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { getDirectory, getProject, getRfis } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const slug = event.params.slug;
  const [project, rfis, directory] = await Promise.all([
    getProject(event, slug),
    getRfis(event, slug),
    getDirectory(event, slug)
  ]);

  return { project, rfis, directory };
};

async function nextRfiNumber(client: NonNullable<App.Locals['supabase']>, projectId: string) {
  const { count, error } = await client
    .from('rfis')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
  return `RFI-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

async function assertProjectMember(
  client: NonNullable<App.Locals['supabase']>,
  projectId: string,
  userId: string,
  label: string
) {
  const { data, error } = await client
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return `${label} must already belong to this project.`;
  return null;
}

async function defaultRfiManagerId(
  client: NonNullable<App.Locals['supabase']>,
  projectId: string,
  userId: string
) {
  const currentUserError = await assertProjectMember(client, projectId, userId, 'RFI manager');
  if (!currentUserError) return userId;

  const { data, error } = await client
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.user_id ?? null;
}

export const actions: Actions = {
  createRfi: async (event) => {
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const access = await requireProjectAccess(event, event.params.slug, {
      writable: true,
      action: 'create RFIs for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);

    let number = formString(form, 'number');
    const title = formString(form, 'subject') || formString(form, 'title') || number;
    const question = formString(form, 'question');
    const suggestedSolution = formOptional(form, 'suggestedSolution');
    const reference = formOptional(form, 'reference');
    const dueDate = formOptional(form, 'dueDate');
    const assignedTo = formOptional(form, 'assignedTo');
    const assignedOrg = formOptional(form, 'assignedOrg');
    const requestedRfiManagerId = formOptional(form, 'rfiManagerId');

    if (!title || !question) return fail(400, { error: 'Subject and question are required.' });
    if (!number) {
      try {
        number = await nextRfiNumber(client, access.project.id);
      } catch (error) {
        return fail(400, { error: error instanceof Error ? error.message : 'Could not create the next RFI number.' });
      }
    }
    if (assignedTo) {
      const assigneeError = await assertProjectMember(client, access.project.id, assignedTo, 'Assignee');
      if (assigneeError) return fail(400, { error: assigneeError });
    }
    let rfiManagerId = requestedRfiManagerId;
    if (!rfiManagerId) {
      try {
        rfiManagerId = await defaultRfiManagerId(client, access.project.id, access.user.id);
      } catch (error) {
        return fail(400, { error: error instanceof Error ? error.message : 'Could not resolve the RFI manager.' });
      }
    }
    if (!rfiManagerId) return fail(400, { error: 'RFI manager is required.' });
    if (rfiManagerId) {
      const managerError = await assertProjectMember(client, access.project.id, rfiManagerId, 'RFI manager');
      if (managerError) return fail(400, { error: managerError });
    }

    const openedDate = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await client
      .from('rfis')
      .insert({
        project_id: access.project.id,
        number,
        title,
        question,
        suggested_solution: suggestedSolution,
        reference,
        opened_date: openedDate,
        due_date: dueDate,
        assigned_to: assignedTo,
        assigned_org: assignedOrg,
        created_by: access.user.id,
        rfi_manager_id: rfiManagerId,
        status: 'open'
      })
      .select('id')
      .single();

    if (error) return fail(400, { error: error.message });
    if (row?.id) {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'rfi.created',
        entityType: 'rfi',
        entityId: row.id,
        metadata: {
          projectSlug: access.project.slug,
          projectName: access.project.name,
          actorEmail: access.user.email,
          number,
          title,
          question,
          dueDate,
          assignedTo,
          assignedOrg,
          creatorId: access.user.id,
          rfiManagerId,
          openedDate
        }
      }).catch((error) => console.error('[notifications] RFI created notification failed:', error));
    }
    return { ok: true };
  },

  answerRfi: async (event) => {
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const id = formString(form, 'id');
    const answer = formString(form, 'answer');
    const requestedStatus = formString(form, 'status');
    const status = requestedStatus || (answer ? 'answered' : '');
    const hasAssignmentFields = form.has('assignedTo') || form.has('assignedOrg');
    const submittedAssignedTo = formOptional(form, 'assignedTo');
    const submittedAssignedOrg = formOptional(form, 'assignedOrg');
    const hasDueDateField = form.has('dueDate');
    const submittedDueDate = formOptional(form, 'dueDate');
    const hasManagerField = form.has('rfiManagerId');
    const submittedRfiManagerId = formOptional(form, 'rfiManagerId');
    if (!id) return fail(400, { error: 'RFI id is required.' });
    if (!['open', 'answered', 'closed'].includes(status)) {
      return fail(400, { error: 'Valid RFI status is required.' });
    }

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member', 'guest'],
      action: 'update RFIs for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);

    if (submittedAssignedTo) {
      const assigneeError = await assertProjectMember(client, access.project.id, submittedAssignedTo, 'Assignee');
      if (assigneeError) return fail(400, { error: assigneeError });
    }
    if (submittedRfiManagerId) {
      const managerError = await assertProjectMember(client, access.project.id, submittedRfiManagerId, 'RFI manager');
      if (managerError) return fail(400, { error: managerError });
    }
    if (hasManagerField && !submittedRfiManagerId) return fail(400, { error: 'RFI manager is required.' });

    const { data: existing, error: existingError } = await client
      .from('rfis')
      .select('id, number, title, question, due_date, assigned_to, assigned_org, created_by, rfi_manager_id, status, answer')
      .eq('id', id)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (existingError) return fail(400, { error: existingError.message });
    if (!existing) return fail(404, { error: 'RFI not found.' });

    const { error } = await client
      .from('rfis')
      .update({
        answer,
        status,
        ...(hasAssignmentFields
          ? {
              assigned_to: submittedAssignedTo,
              assigned_org: submittedAssignedOrg
            }
          : {}),
        ...(hasDueDateField
          ? {
              due_date: submittedDueDate
            }
          : {}),
        ...(hasManagerField
          ? {
              rfi_manager_id: submittedRfiManagerId
            }
          : {})
      })
      .eq('id', id)
      .eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });

    const assignedTo = hasAssignmentFields ? submittedAssignedTo : existing.assigned_to;
    const assignedOrg = hasAssignmentFields ? submittedAssignedOrg : existing.assigned_org;
    const dueDate = hasDueDateField ? submittedDueDate : existing.due_date;
    const rfiManagerId = hasManagerField ? submittedRfiManagerId : existing.rfi_manager_id;
    const metadata = {
      projectSlug: access.project.slug,
      projectName: access.project.name,
      actorEmail: access.user.email,
      number: existing.number,
      title: existing.title,
      question: existing.question,
      answer,
      dueDate,
      previousDueDate: existing.due_date,
      assignedTo,
      assignedOrg,
      previousAssignedTo: existing.assigned_to,
      previousAssignedOrg: existing.assigned_org,
      creatorId: existing.created_by,
      rfiManagerId,
      previousRfiManagerId: existing.rfi_manager_id,
      status
    };

    const ballInCourtChanged = hasAssignmentFields && assignedTo && assignedTo !== existing.assigned_to;
    const managerChanged = hasManagerField && rfiManagerId && rfiManagerId !== existing.rfi_manager_id;

    if (ballInCourtChanged) {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'rfi.ball_in_court_shift',
        entityType: 'rfi',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] RFI ball-in-court notification failed:', error));
    }
    if (ballInCourtChanged || managerChanged) {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'rfi.assigned',
        entityType: 'rfi',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] RFI reassigned notification failed:', error));
    }
    if (hasDueDateField && dueDate !== existing.due_date) {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'rfi.due_date_changed',
        entityType: 'rfi',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] RFI due-date notification failed:', error));
    }
    if (answer && answer !== (existing.answer ?? '')) {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'rfi.response_added',
        entityType: 'rfi',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] RFI response notification failed:', error));
    }
    if (status === 'closed' && existing.status !== 'closed') {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'rfi.closed',
        entityType: 'rfi',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] RFI closed notification failed:', error));
    }
    if (existing.status === 'closed' && status !== 'closed') {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'rfi.reopened',
        entityType: 'rfi',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] RFI reopened notification failed:', error));
    }
    return { ok: true };
  }
};
