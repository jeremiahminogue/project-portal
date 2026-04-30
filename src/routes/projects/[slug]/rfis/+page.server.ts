import { fail } from '@sveltejs/kit';
import { actionError, formOptional, formString } from '$lib/server/auth';
import {
  existingFileAttachmentsFor,
  formHasItemAttachments,
  mergeItemAttachments,
  normalizeItemAttachments,
  syncItemAttachmentLinks,
  uploadedItemAttachmentsFor,
  type ItemAttachment
} from '$lib/server/item-attachments';
import { notifyProjectEvent } from '$lib/server/notifications';
import {
  databaseClientForProjectAccess,
  isProjectAccessError,
  projectRoleCapabilities,
  requireProjectAccess
} from '$lib/server/project-access';
import { getDirectory, getFiles, getProject, getRfis } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const slug = event.params.slug;
  const [project, rfis, directory, files] = await Promise.all([
    getProject(event, slug),
    getRfis(event, slug),
    getDirectory(event, slug),
    getFiles(event, slug)
  ]);
  const access = event.locals.supabase ? await requireProjectAccess(event, slug) : null;
  const role = access && !isProjectAccessError(access) ? access.role : null;

  return {
    project,
    rfis,
    directory,
    files,
    communicationAccess: {
      role,
      canCreate: role ? projectRoleCapabilities[role].canCreateCommunication : !event.locals.supabase,
      canReview: role ? projectRoleCapabilities[role].canReviewCommunication : !event.locals.supabase,
      canAttachFiles: role ? projectRoleCapabilities[role].canUploadFiles : !event.locals.supabase
    }
  };
};

async function nextRfiNumber(client: NonNullable<App.Locals['supabase']>, projectId: string) {
  const { data, error } = await client
    .from('rfis')
    .select('number')
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
  const max = (data ?? []).reduce((current: number, row: { number?: string | null }) => {
    const match = /^RFI-(\d+)$/i.exec(row.number ?? '');
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `RFI-${String(max + 1).padStart(3, '0')}`;
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

async function assertProjectMembers(
  client: NonNullable<App.Locals['supabase']>,
  projectId: string,
  userIds: string[],
  label: string
) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return null;

  const { data, error } = await client
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .in('user_id', uniqueIds);
  if (error) return error.message;

  const found = new Set((data ?? []).map((row: { user_id: string }) => row.user_id));
  const missing = uniqueIds.filter((id) => !found.has(id));
  if (missing.length) return `${label} must already belong to this project.`;
  return null;
}

function formStringArray(form: FormData, name: string) {
  return [...new Set(form.getAll(name).filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function appendRfiActivity(existing: unknown, entry: { by: string; type: string; note: string }) {
  const list = Array.isArray(existing) ? existing : [];
  return [
    ...list.slice(-24),
    {
      at: new Date().toISOString(),
      ...entry
    }
  ];
}

export const actions: Actions = {
  createRfi: async (event) => {
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member'],
      action: 'create RFIs for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return actionError('Supabase is not configured yet.');
    if (formHasItemAttachments(form) && !projectRoleCapabilities[access.role].canUploadFiles) {
      return actionError('Not authorized to attach files to this project.', 403);
    }

    let number = formString(form, 'number');
    const title = formString(form, 'subject') || formString(form, 'title') || number;
    const question = formString(form, 'question');
    const suggestedSolution = formOptional(form, 'suggestedSolution');
    const reference = formOptional(form, 'reference');
    const dueDate = formOptional(form, 'dueDate');
    const assignedTo = formOptional(form, 'assignedTo');
    const assignedOrg = formOptional(form, 'assignedOrg');
    const requestedRfiManagerId = formOptional(form, 'rfiManagerId');
    const distributionIds = formStringArray(form, 'distributionIds');
    const attachmentIds = form.getAll('attachmentIds').filter((value): value is string => typeof value === 'string');

    if (!title || !question) return fail(400, { error: 'Subject and question are required.' });
    if (!number) {
      try {
        number = await nextRfiNumber(projectClient, access.project.id);
      } catch (error) {
        return fail(400, { error: error instanceof Error ? error.message : 'Could not create the next RFI number.' });
      }
    }
    if (assignedTo) {
      const assigneeError = await assertProjectMember(projectClient, access.project.id, assignedTo, 'Assignee');
      if (assigneeError) return fail(400, { error: assigneeError });
    }
    const distributionError = await assertProjectMembers(projectClient, access.project.id, distributionIds, 'Distribution recipients');
    if (distributionError) return fail(400, { error: distributionError });
    let rfiManagerId = requestedRfiManagerId;
    if (!rfiManagerId) {
      try {
        rfiManagerId = await defaultRfiManagerId(projectClient, access.project.id, access.user.id);
      } catch (error) {
        return fail(400, { error: error instanceof Error ? error.message : 'Could not resolve the RFI manager.' });
      }
    }
    if (!rfiManagerId) return fail(400, { error: 'RFI manager is required.' });
    if (rfiManagerId) {
      const managerError = await assertProjectMember(projectClient, access.project.id, rfiManagerId, 'RFI manager');
      if (managerError) return fail(400, { error: managerError });
    }

    let attachments: ItemAttachment[] = [];
    try {
      attachments = mergeItemAttachments(
        await existingFileAttachmentsFor(projectClient, access.project.id, attachmentIds),
        await uploadedItemAttachmentsFor({
          event,
          access,
          form,
          folderName: `RFI ${number} Attachments`
        })
      );
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not attach selected files.' });
    }

    const openedDate = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await projectClient
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
        status: 'open',
        attachments_json: attachments,
        distribution_json: distributionIds,
        activity_json: appendRfiActivity([], {
          by: access.user.email ?? 'Project user',
          type: 'created',
          note: `Opened ${number} and routed it for response.`
        })
      })
      .select('id')
      .single();

    if (error) return fail(400, { error: error.message });
    if (row?.id) {
      try {
        await syncItemAttachmentLinks({
          client: projectClient,
          kind: 'rfi',
          projectId: access.project.id,
          itemId: row.id,
          attachments,
          userId: access.user.id
        });
      } catch (error) {
        return fail(400, { error: error instanceof Error ? error.message : 'Could not save RFI file attachments.' });
      }

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
          distributionUserIds: distributionIds,
          openedDate,
          attachmentCount: attachments.length
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
    const hasDistributionField = form.has('distributionIds');
    const submittedDistributionIds = formStringArray(form, 'distributionIds');
    if (!id) return fail(400, { error: 'RFI id is required.' });
    if (!['open', 'answered', 'closed'].includes(status)) {
      return fail(400, { error: 'Valid RFI status is required.' });
    }

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member', 'guest'],
      action: 'update RFIs for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return actionError('Supabase is not configured yet.');
    if (formHasItemAttachments(form) && !projectRoleCapabilities[access.role].canUploadFiles) {
      return actionError('Not authorized to attach files to this project.', 403);
    }

    if (submittedAssignedTo) {
      const assigneeError = await assertProjectMember(projectClient, access.project.id, submittedAssignedTo, 'Assignee');
      if (assigneeError) return fail(400, { error: assigneeError });
    }
    if (submittedRfiManagerId) {
      const managerError = await assertProjectMember(projectClient, access.project.id, submittedRfiManagerId, 'RFI manager');
      if (managerError) return fail(400, { error: managerError });
    }
    if (hasDistributionField) {
      const distributionError = await assertProjectMembers(projectClient, access.project.id, submittedDistributionIds, 'Distribution recipients');
      if (distributionError) return fail(400, { error: distributionError });
    }
    if (hasManagerField && !submittedRfiManagerId) return fail(400, { error: 'RFI manager is required.' });

    const { data: existing, error: existingError } = await projectClient
      .from('rfis')
      .select('id, number, title, question, due_date, assigned_to, assigned_org, created_by, rfi_manager_id, status, answer, attachments_json, distribution_json, activity_json')
      .eq('id', id)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (existingError) return fail(400, { error: existingError.message });
    if (!existing) return fail(404, { error: 'RFI not found.' });

    const attachmentIds = form.getAll('attachmentIds').filter((value): value is string => typeof value === 'string');
    const removeAttachmentIds = new Set(formStringArray(form, 'removeAttachmentIds'));
    const currentAttachments = normalizeItemAttachments(existing.attachments_json).filter(
      (attachment) => !attachment.id || !removeAttachmentIds.has(attachment.id)
    );
    let attachments = currentAttachments;
    try {
      attachments = mergeItemAttachments(
        currentAttachments,
        await existingFileAttachmentsFor(projectClient, access.project.id, attachmentIds),
        await uploadedItemAttachmentsFor({
          event,
          access,
          form,
          folderName: `RFI ${existing.number} Attachments`
        })
      );
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not attach selected files.' });
    }

    const { error } = await projectClient
      .from('rfis')
      .update({
        answer,
        status,
        attachments_json: attachments,
        activity_json: appendRfiActivity(existing.activity_json, {
          by: access.user.email ?? 'Project user',
          type: status,
          note: answer || `Updated RFI status to ${status}.`
        }),
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
          : {}),
        ...(hasDistributionField
          ? {
              distribution_json: submittedDistributionIds
            }
          : {})
      })
      .eq('id', id)
      .eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });

    try {
      await syncItemAttachmentLinks({
        client: projectClient,
        kind: 'rfi',
        projectId: access.project.id,
        itemId: id,
        attachments,
        userId: access.user.id
      });
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not save RFI file attachments.' });
    }

    const assignedTo = hasAssignmentFields ? submittedAssignedTo : existing.assigned_to;
    const assignedOrg = hasAssignmentFields ? submittedAssignedOrg : existing.assigned_org;
    const dueDate = hasDueDateField ? submittedDueDate : existing.due_date;
    const rfiManagerId = hasManagerField ? submittedRfiManagerId : existing.rfi_manager_id;
    const distributionUserIds = hasDistributionField ? submittedDistributionIds : Array.isArray(existing.distribution_json) ? existing.distribution_json : [];
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
      distributionUserIds,
      status,
      attachmentCount: attachments.length
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
  },

  deleteRfi: async (event) => {
    const form = await event.request.formData();
    const id = formString(form, 'id');
    if (!id) return fail(400, { error: 'Choose an RFI to delete.' });
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'delete RFIs for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return actionError('Supabase is not configured yet.');

    const { error } = await projectClient
      .from('rfis')
      .delete()
      .eq('id', id)
      .eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });
    return { ok: true };
  }
};
