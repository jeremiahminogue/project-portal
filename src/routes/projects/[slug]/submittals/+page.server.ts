import { fail } from '@sveltejs/kit';
import { actionError, formOptional, formString } from '$lib/server/auth';
import {
  existingFileAttachmentsFor,
  formHasItemAttachments,
  mergeItemAttachments,
  normalizeItemAttachments,
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
import { getDirectory, getFiles, getProject, getSubmittals } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

function formStringArray(form: FormData, name: string) {
  return [...new Set(form.getAll(name).filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
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
  return uniqueIds.every((id) => found.has(id)) ? null : `${label} must already belong to this project.`;
}

function nextStepStatus(index: number) {
  return index === 0 ? 'submitted' : 'draft';
}

export const load: PageServerLoad = async (event) => {
  const slug = event.params.slug;
  const [project, submittals, directory, files] = await Promise.all([
    getProject(event, slug),
    getSubmittals(event, slug),
    getDirectory(event, slug),
    getFiles(event, slug)
  ]);
  const access = event.locals.supabase ? await requireProjectAccess(event, slug) : null;
  const role = access && !isProjectAccessError(access) ? access.role : null;

  return {
    project,
    submittals,
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

export const actions: Actions = {
  createSubmittal: async (event) => {
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member'],
      action: 'create submittals for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return actionError('Supabase is not configured yet.');
    if (formHasItemAttachments(form) && !projectRoleCapabilities[access.role].canUploadFiles) {
      return actionError('Not authorized to attach files to this project.', 403);
    }

    const number = formString(form, 'number');
    const title = formString(form, 'title');
    const specSection = formOptional(form, 'specSection');
    const dueDate = formOptional(form, 'dueDate');
    const submitBy = formOptional(form, 'submitBy');
    const owner = formOptional(form, 'owner');
    const receivedFrom = formOptional(form, 'receivedFrom');
    const revision = Math.max(0, Number(formString(form, 'revision') || 0));
    const notes = formOptional(form, 'notes');
    const sendEmails = form.get('sendEmails') === 'on';
    const routingAssigneeIds = formStringArray(form, 'routingAssigneeIds');
    const attachmentIds = form.getAll('attachmentIds').filter((value): value is string => typeof value === 'string');

    if (!number || !title) return fail(400, { error: 'Number and title are required.' });
    if (owner) {
      const { data: ownerMember, error: ownerError } = await projectClient
        .from('project_members')
        .select('id')
        .eq('project_id', access.project.id)
        .eq('user_id', owner)
        .maybeSingle();
      if (ownerError) return fail(400, { error: ownerError.message });
      if (!ownerMember) return fail(400, { error: 'Submittal owner must already belong to this project.' });
    }
    const memberError = await assertProjectMembers(
      projectClient,
      access.project.id,
      [receivedFrom, ...routingAssigneeIds].filter(Boolean) as string[],
      'Routing recipients'
    );
    if (memberError) return fail(400, { error: memberError });

    let attachments: ItemAttachment[] = [];
    try {
      attachments = mergeItemAttachments(
        await existingFileAttachmentsFor(projectClient, access.project.id, attachmentIds),
        await uploadedItemAttachmentsFor({
          event,
          access,
          form,
          folderName: `Submittal ${number} Attachments`
        })
      );
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not attach selected files.' });
    }

    const { data: row, error } = await projectClient
      .from('submittals')
      .insert({
        project_id: access.project.id,
        number,
        title,
        spec_section: specSection,
        submitted_date: new Date().toISOString().slice(0, 10),
        due_date: dueDate,
        submit_by: submitBy,
        received_from: receivedFrom,
        revision,
        owner,
        status: 'submitted',
        notes,
        attachments_json: attachments
      })
      .select('id')
      .single();

    if (error) return fail(400, { error: error.message });

    if (row?.id) {
      const route = routingAssigneeIds.length ? routingAssigneeIds : owner ? [owner] : [];
      const routing = route.map((assignee, index) => ({
        submittal_id: row.id,
        step_order: index,
        assignee,
        role: 'member',
        due_date: index === 0 ? dueDate : null,
        status: nextStepStatus(index)
      }));
      if (routing.length) {
        const { error: routingError } = await projectClient.from('submittal_routing_steps').insert(routing);
        if (routingError) return fail(400, { error: routingError.message });
      }

      if (sendEmails) {
        const metadata = {
          projectSlug: access.project.slug,
          projectName: access.project.name,
          actorEmail: access.user.email,
          number,
          title,
          specSection,
          dueDate,
          owner,
          submitBy,
          receivedFrom,
          revision,
          workflowAssigneeId: route[0] ?? owner,
          skipUserIds: owner ? [owner] : [],
          status: 'submitted',
          notes,
          attachmentCount: attachments.length
        };
        await notifyProjectEvent(event, {
          projectId: access.project.id,
          actorId: access.user.id,
          type: 'submittal.created',
          entityType: 'submittal',
          entityId: row.id,
          metadata
        }).catch((error) => console.error('[notifications] submittal created notification failed:', error));
        if (route[0] ?? owner) {
          await notifyProjectEvent(event, {
            projectId: access.project.id,
            actorId: access.user.id,
            type: 'submittal.action_required',
            entityType: 'submittal',
            entityId: row.id,
            metadata
          }).catch((error) => console.error('[notifications] submittal action-required notification failed:', error));
        }
      }
    }

    return { ok: true };
  },

  updateSubmittal: async (event) => {
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const id = formString(form, 'id');
    const status = formString(form, 'status');
    const decision = formOptional(form, 'decision');
    const workflowAssigneeId = formOptional(form, 'workflowAssigneeId');
    const stepDueDate = formOptional(form, 'stepDueDate');
    const sendEmails = form.get('sendEmails') === 'on';

    if (!id || !['draft', 'submitted', 'in_review', 'approved', 'revise_resubmit', 'rejected'].includes(status)) {
      return fail(400, { error: 'Valid submittal status is required.' });
    }

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member', 'guest'],
      action: 'update submittals for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return actionError('Supabase is not configured yet.');
    if (formHasItemAttachments(form) && !projectRoleCapabilities[access.role].canUploadFiles) {
      return actionError('Not authorized to attach files to this project.', 403);
    }
    if (workflowAssigneeId) {
      const assigneeError = await assertProjectMembers(projectClient, access.project.id, [workflowAssigneeId], 'Workflow assignee');
      if (assigneeError) return fail(400, { error: assigneeError });
    }

    const { data: existing, error: existingError } = await projectClient
      .from('submittals')
      .select('id, number, title, spec_section, due_date, owner, status, decision, notes, attachments_json, current_step, revision')
      .eq('id', id)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (existingError) return fail(400, { error: existingError.message });
    if (!existing) return fail(404, { error: 'Submittal not found.' });

    const attachmentIds = form.getAll('attachmentIds').filter((value): value is string => typeof value === 'string');
    const removeAttachmentIds = new Set(formStringArray(form, 'removeAttachmentIds'));
    const originalAttachments = normalizeItemAttachments(existing.attachments_json);
    const currentAttachments = originalAttachments.filter(
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
          folderName: `Submittal ${existing.number} Attachments`
        })
      );
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not attach selected files.' });
    }

    const attachmentCountChanged = attachments.length !== originalAttachments.length;
    const { error } = await projectClient
      .from('submittals')
      .update({
        status,
        decision,
        attachments_json: attachments,
        owner: workflowAssigneeId ?? existing.owner,
        current_step: workflowAssigneeId && workflowAssigneeId !== existing.owner ? (existing.current_step ?? 0) + 1 : existing.current_step
      })
      .eq('id', id)
      .eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });

    if (workflowAssigneeId && workflowAssigneeId !== existing.owner) {
      const { error: routeError } = await projectClient.from('submittal_routing_steps').insert({
        submittal_id: id,
        step_order: (existing.current_step ?? 0) + 1,
        assignee: workflowAssigneeId,
        role: 'member',
        due_date: stepDueDate,
        status: 'submitted'
      });
      if (routeError) return fail(400, { error: routeError.message });
    } else {
      const { error: routeUpdateError } = await projectClient
        .from('submittal_routing_steps')
        .update({
          status,
          response: decision,
          due_date: stepDueDate,
          completed_by: access.user.id,
          signed_off_at: ['approved', 'revise_resubmit', 'rejected'].includes(status) ? new Date().toISOString() : null
        })
        .eq('submittal_id', id)
        .eq('step_order', existing.current_step ?? 0);
      if (routeUpdateError && routeUpdateError.code !== '42501') return fail(400, { error: routeUpdateError.message });
    }

    const metadata = {
      projectSlug: access.project.slug,
      projectName: access.project.name,
      actorEmail: access.user.email,
      number: existing.number,
      title: existing.title,
      specSection: existing.spec_section,
      dueDate: existing.due_date,
      owner: workflowAssigneeId ?? existing.owner,
      workflowAssigneeId: workflowAssigneeId ?? existing.owner,
      revision: existing.revision ?? 0,
      previousStatus: existing.status,
      status,
      decision,
      notes: existing.notes,
      attachmentCount: attachments.length
    };

    if (sendEmails && existing.status !== status) {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'submittal.workflow_step_completed',
        entityType: 'submittal',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] submittal workflow notification failed:', error));

      const decisionEvent =
        status === 'approved'
          ? 'submittal.approved'
          : status === 'revise_resubmit'
            ? 'submittal.revise_resubmit'
            : status === 'rejected'
              ? 'submittal.rejected'
              : null;
      if (decisionEvent) {
        await notifyProjectEvent(event, {
          projectId: access.project.id,
          actorId: access.user.id,
          type: decisionEvent,
          entityType: 'submittal',
          entityId: id,
          metadata
        }).catch((error) => console.error('[notifications] submittal decision notification failed:', error));
      } else if (existing.owner && ['submitted', 'in_review'].includes(status)) {
        await notifyProjectEvent(event, {
          projectId: access.project.id,
          actorId: access.user.id,
          type: 'submittal.action_required',
          entityType: 'submittal',
          entityId: id,
          metadata
        }).catch((error) => console.error('[notifications] submittal action-required notification failed:', error));
      }
    } else if (sendEmails && ((decision && decision !== (existing.decision ?? '')) || attachmentCountChanged)) {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'submittal.updated',
        entityType: 'submittal',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] submittal update notification failed:', error));
    }
    return { ok: true };
  }
};
