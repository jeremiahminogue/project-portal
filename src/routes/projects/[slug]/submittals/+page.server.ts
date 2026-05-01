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
import { getDirectory, getFiles, getProject, getSubmittals } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

function formStringArray(form: FormData, name: string) {
  return [...new Set(form.getAll(name).filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function formStringList(form: FormData, name: string) {
  return form.getAll(name).map((value) => (typeof value === 'string' ? value : ''));
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
  const userId = access && !isProjectAccessError(access) ? access.user.id : null;

  // Look up which project members carry the submittal-manager flag so the
  // page can (a) auto-route unrouted submittals to one of them and (b) show
  // a "Set up routing" panel only to managers.
  let submittalManagerIds: string[] = [];
  let isSubmittalManager = false;
  if (event.locals.supabase && access && !isProjectAccessError(access)) {
    const { data: managers } = await event.locals.supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', access.project.id)
      .eq('is_submittal_manager', true);
    submittalManagerIds = (managers ?? [])
      .map((row: { user_id: string | null }) => row.user_id)
      .filter((id): id is string => Boolean(id));
    isSubmittalManager = submittalManagerIds.includes(access.user.id);
  }

  return {
    project,
    submittals,
    directory,
    files,
    communicationAccess: {
      role,
      // Surface the current user's id so the client can compute the same
      // submitter/BIC/admin gates the server enforces in updateSubmittal.
      userId,
      canCreate: role ? projectRoleCapabilities[role].canCreateCommunication : !event.locals.supabase,
      canReview: role ? projectRoleCapabilities[role].canReviewCommunication : !event.locals.supabase,
      canAttachFiles: role ? projectRoleCapabilities[role].canUploadFiles : !event.locals.supabase,
      isSubmittalManager,
      submittalManagerIds
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
    const receivedFrom = formOptional(form, 'receivedFrom');
    const revision = Math.max(0, Number(formString(form, 'revision') || 0));
    const notes = formOptional(form, 'notes');
    const sendEmails = form.get('sendEmails') === 'on';

    // Parallel arrays — preserve row order from the create modal so step_order is meaningful.
    const rawAssignees = formStringList(form, 'routingAssigneeIds');
    const rawDueDates = formStringList(form, 'routingDueDates');
    const routing = rawAssignees
      .map((assignee, index) => ({ assignee: assignee.trim(), dueDate: (rawDueDates[index] ?? '').trim() }))
      .filter((row) => row.assignee.length > 0);
    const routingAssigneeIds = routing.map((row) => row.assignee);

    // No routing was provided (non-manager submitted from a member/guest UI).
    // Hand the submittal to the project's first designated submittal manager
    // so they can plan the chain. If no manager is set, the submittal stays
    // unassigned and the next admin who opens it routes it.
    let owner: string | null = routing[0]?.assignee || null;
    if (!owner) {
      const { data: managerRows } = await projectClient
        .from('project_members')
        .select('user_id')
        .eq('project_id', access.project.id)
        .eq('is_submittal_manager', true)
        .limit(1);
      owner = (managerRows?.[0]?.user_id as string | null) ?? null;
    }

    const attachmentIds = form.getAll('attachmentIds').filter((value): value is string => typeof value === 'string');

    if (!number || !title) return fail(400, { error: 'Number and title are required.' });
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
        submitted_by: access.user.id,
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
      try {
        await syncItemAttachmentLinks({
          client: projectClient,
          kind: 'submittal',
          projectId: access.project.id,
          itemId: row.id,
          attachments,
          userId: access.user.id
        });
      } catch (error) {
        return fail(400, { error: error instanceof Error ? error.message : 'Could not save submittal file attachments.' });
      }

      const routingSteps = routing.map((step, index) => ({
        submittal_id: row.id,
        step_order: index,
        assignee: step.assignee,
        role: 'member',
        due_date: step.dueDate || (index === 0 ? dueDate : null),
        status: nextStepStatus(index)
      }));
      if (routingSteps.length) {
        const { error: routingError } = await projectClient.from('submittal_routing_steps').insert(routingSteps);
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
          workflowAssigneeId: owner,
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
        if (owner) {
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

    // Optional metadata edits — sent by the inline-edit panel in the detail
    // modal. Each is only applied when present in the form so existing flows
    // (status-only updates) still work without supplying the full record.
    const editTitle = form.has('editTitle') ? formString(form, 'editTitle') : null;
    const editSpecSection = form.has('editSpecSection') ? formOptional(form, 'editSpecSection') : undefined;
    const editDueDate = form.has('editDueDate') ? formOptional(form, 'editDueDate') : undefined;
    const editSubmitBy = form.has('editSubmitBy') ? formOptional(form, 'editSubmitBy') : undefined;
    const editNotes = form.has('editNotes') ? formOptional(form, 'editNotes') : undefined;
    const editRevision = form.has('editRevision') ? Number(formString(form, 'editRevision') || 0) : null;
    const editReceivedFrom = form.has('editReceivedFrom') ? formOptional(form, 'editReceivedFrom') : undefined;

    if (!id || !['draft', 'submitted', 'in_review', 'approved', 'revise_resubmit', 'rejected'].includes(status)) {
      return fail(400, { error: 'Valid submittal status is required.' });
    }
    if (editTitle !== null && !editTitle.trim()) {
      return fail(400, { error: 'Title cannot be empty.' });
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
    if (editReceivedFrom) {
      const receivedError = await assertProjectMembers(projectClient, access.project.id, [editReceivedFrom], 'Received from');
      if (receivedError) return fail(400, { error: receivedError });
    }

    const { data: existing, error: existingError } = await projectClient
      .from('submittals')
      .select('id, number, title, spec_section, due_date, owner, status, decision, notes, attachments_json, current_step, revision, submitted_by')
      .eq('id', id)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (existingError) return fail(400, { error: existingError.message });
    if (!existing) return fail(404, { error: 'Submittal not found.' });

    // Pull the routing chain so we can auto-advance on approval and bounce
    // back to the submitter on revise/reject without making the reviewer
    // remember the next assignee.
    const { data: routingChain, error: routingError } = await projectClient
      .from('submittal_routing_steps')
      .select('id, step_order, assignee, status, due_date')
      .eq('submittal_id', id)
      .order('step_order', { ascending: true });
    if (routingError) return fail(400, { error: routingError.message });
    const chain = routingChain ?? [];
    const currentIdx = existing.current_step ?? 0;
    const currentRow = chain.find((row) => row.step_order === currentIdx) ?? null;
    const nextRow = chain.find((row) => row.step_order === currentIdx + 1) ?? null;
    const isFinalStep = !nextRow;
    const submitterId = (existing.submitted_by as string | null) ?? null;
    const overrideHandoff = Boolean(workflowAssigneeId && workflowAssigneeId !== existing.owner);
    const isApproval = status === 'approved';
    const isKickback = status === 'revise_resubmit' || status === 'rejected';

    // ── Authorization gate ────────────────────────────────────
    //
    // Three actor classes mirror the page-level gates and the RFI gate:
    //   isAdmin     - admin / superadmin: can do anything.
    //   isBic       - the current ball-in-court (`owner`) or the assignee
    //                 on the current routing step: can drive workflow
    //                 (status, decision, handoff) + attach files.
    //   isSubmitter - the original `submitted_by` user: can edit metadata
    //                 (title, spec, dates, notes, revision, received_from)
    //                 + attach files. Cannot move workflow.
    // Anyone else who somehow reaches this action gets a 403 — matches
    // server-side rejection of the readonly banner the UI shows them.
    const isAdmin = access.role === 'admin' || access.role === 'superadmin';
    const currentStepAssignee = (currentRow?.assignee as string | null) ?? null;
    const isBic =
      isAdmin ||
      (existing.owner != null && existing.owner === access.user.id) ||
      (currentStepAssignee != null && currentStepAssignee === access.user.id);
    const isSubmitter = isAdmin || (submitterId != null && submitterId === access.user.id);
    if (!isAdmin && !isBic && !isSubmitter) {
      return actionError('Only the assigned reviewer, the original submitter, or a project admin can change this submittal.', 403);
    }

    const attachmentIds = form.getAll('attachmentIds').filter((value): value is string => typeof value === 'string');
    // Attachment removal is admin-only. Non-admins keep all existing files
    // so a normal user cannot delete somebody else's upload — they can still
    // add new ones, and an admin clears stale files before the original
    // uploader re-uploads.
    const requestedRemoveIds = new Set(formStringArray(form, 'removeAttachmentIds'));
    if (!isAdmin && requestedRemoveIds.size > 0) {
      return actionError('Only a project admin can remove submittal attachments.', 403);
    }
    const removeAttachmentIds = isAdmin ? requestedRemoveIds : new Set<string>();
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

    // Decide where the workflow ends up after this decision. Workflow
    // writes are BIC-only — a submitter who only fixes a typo skips this
    // entire block so we don't accidentally rewrite the active step's
    // status or reassign ownership.
    const allowWorkflowWrite = isAdmin || isBic;
    let nextSubmittalStatus = existing.status as typeof status;
    let nextOwner: string | null = (existing.owner as string | null) ?? null;
    let nextStepIdx = currentIdx;

    if (allowWorkflowWrite) {
      nextSubmittalStatus = status;
      if (overrideHandoff && workflowAssigneeId) {
        nextOwner = workflowAssigneeId;
        nextStepIdx = currentIdx + 1;
        if (isApproval && isFinalStep) nextSubmittalStatus = 'in_review';
      } else if (isApproval) {
        if (nextRow) {
          nextOwner = nextRow.assignee as string;
          nextStepIdx = currentIdx + 1;
          nextSubmittalStatus = 'in_review';
        } else {
          nextSubmittalStatus = 'approved';
        }
      } else if (isKickback) {
        nextOwner = submitterId;
        nextStepIdx = 0;
      }
    }

    const updatePayload: Record<string, unknown> = {
      status: nextSubmittalStatus,
      decision: allowWorkflowWrite ? decision : existing.decision,
      attachments_json: attachments,
      owner: nextOwner,
      current_step: nextStepIdx
    };

    // Metadata writes are admin OR submitter. A BIC who isn't the submitter
    // can act on workflow but not silently overwrite the original record's
    // title, spec, dates, notes, revision, or received-from.
    const allowMetadataWrite = isAdmin || isSubmitter;
    const tryingMetadataWrite =
      editTitle !== null ||
      editSpecSection !== undefined ||
      editDueDate !== undefined ||
      editSubmitBy !== undefined ||
      editNotes !== undefined ||
      editRevision !== null ||
      editReceivedFrom !== undefined;
    if (!allowMetadataWrite && tryingMetadataWrite) {
      return actionError('Only a project admin or the original submitter can edit submittal details.', 403);
    }
    if (allowMetadataWrite) {
      if (editTitle !== null) updatePayload.title = editTitle.trim();
      if (editSpecSection !== undefined) updatePayload.spec_section = editSpecSection;
      if (editDueDate !== undefined) updatePayload.due_date = editDueDate;
      if (editSubmitBy !== undefined) updatePayload.submit_by = editSubmitBy;
      if (editNotes !== undefined) updatePayload.notes = editNotes;
      if (editRevision !== null && Number.isFinite(editRevision)) updatePayload.revision = Math.max(0, editRevision);
      if (editReceivedFrom !== undefined) updatePayload.received_from = editReceivedFrom;
    }

    const { error } = await projectClient
      .from('submittals')
      .update(updatePayload)
      .eq('id', id)
      .eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });

    try {
      await syncItemAttachmentLinks({
        client: projectClient,
        kind: 'submittal',
        projectId: access.project.id,
        itemId: id,
        attachments,
        userId: access.user.id
      });
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not save submittal file attachments.' });
    }

    // Routing-step writes mirror the workflow gate. A submitter-only edit
    // skips this entire block — they can fix metadata without re-stamping
    // the active reviewer's response.
    if (allowWorkflowWrite) {
      // Always stamp the current step row with the decision + response.
      if (currentRow) {
        const { error: routeUpdateError } = await projectClient
          .from('submittal_routing_steps')
          .update({
            status,
            response: decision,
            due_date: stepDueDate ?? currentRow.due_date,
            completed_by: access.user.id,
            signed_off_at: ['approved', 'revise_resubmit', 'rejected'].includes(status) ? new Date().toISOString() : null
          })
          .eq('id', currentRow.id);
        if (routeUpdateError && routeUpdateError.code !== '42501') return fail(400, { error: routeUpdateError.message });
      }

      if (overrideHandoff && workflowAssigneeId) {
        // Manual handoff: append a new step beyond the planned chain.
        const { error: routeError } = await projectClient.from('submittal_routing_steps').insert({
          submittal_id: id,
          step_order: currentIdx + 1,
          assignee: workflowAssigneeId,
          role: 'member',
          due_date: stepDueDate,
          status: 'submitted'
        });
        if (routeError) return fail(400, { error: routeError.message });
      } else if (isApproval && nextRow) {
        // Auto-advance: arm the next planned step so the assignee sees it as
        // active and the action_required email points at them.
        const { error: nextRowError } = await projectClient
          .from('submittal_routing_steps')
          .update({ status: 'submitted', due_date: stepDueDate ?? nextRow.due_date })
          .eq('id', nextRow.id);
        if (nextRowError && nextRowError.code !== '42501') return fail(400, { error: nextRowError.message });
      }
    }

    const metadata = {
      projectSlug: access.project.slug,
      projectName: access.project.name,
      actorEmail: access.user.email,
      number: existing.number,
      title: existing.title,
      specSection: existing.spec_section,
      dueDate: existing.due_date,
      owner: nextOwner,
      workflowAssigneeId: nextOwner,
      submittedById: submitterId,
      stepIndex: nextStepIdx,
      totalSteps: chain.length,
      revision: existing.revision ?? 0,
      previousStatus: existing.status,
      status: nextSubmittalStatus,
      decision: allowWorkflowWrite ? decision : existing.decision,
      notes: existing.notes,
      attachmentCount: attachments.length
    };

    if (sendEmails && allowWorkflowWrite && existing.status !== nextSubmittalStatus) {
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'submittal.workflow_step_completed',
        entityType: 'submittal',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] submittal workflow notification failed:', error));

      // Final approval → notify approval distribution.
      // Revise/reject → notify the submitter so they know to fix and resubmit.
      // Mid-chain approval → notify the next assignee that it's their turn.
      const decisionEvent =
        nextSubmittalStatus === 'approved'
          ? 'submittal.approved'
          : nextSubmittalStatus === 'revise_resubmit'
            ? 'submittal.revise_resubmit'
            : nextSubmittalStatus === 'rejected'
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
      } else if (nextOwner && ['submitted', 'in_review'].includes(nextSubmittalStatus)) {
        await notifyProjectEvent(event, {
          projectId: access.project.id,
          actorId: access.user.id,
          type: 'submittal.action_required',
          entityType: 'submittal',
          entityId: id,
          metadata
        }).catch((error) => console.error('[notifications] submittal action-required notification failed:', error));
      }
    } else if (
      sendEmails &&
      ((allowWorkflowWrite && decision && decision !== (existing.decision ?? '')) || attachmentCountChanged)
    ) {
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
  },

  routeSubmittal: async (event) => {
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const id = formString(form, 'id');
    if (!id) return fail(400, { error: 'Submittal id is required.' });

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member'],
      action: 'route submittals for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return actionError('Supabase is not configured yet.');

    // Admins can always route. Members must carry the submittal-manager flag
    // for this project.
    const isAdmin = access.role === 'admin' || access.role === 'superadmin';
    if (!isAdmin) {
      const { data: managerRow, error: managerError } = await projectClient
        .from('project_members')
        .select('is_submittal_manager')
        .eq('project_id', access.project.id)
        .eq('user_id', access.user.id)
        .maybeSingle();
      if (managerError) return fail(400, { error: managerError.message });
      if (!managerRow?.is_submittal_manager) {
        return actionError('Only submittal managers can route submittals.', 403);
      }
    }

    const rawAssignees = formStringList(form, 'routingAssigneeIds');
    const rawDueDates = formStringList(form, 'routingDueDates');
    const routing = rawAssignees
      .map((assignee, index) => ({ assignee: assignee.trim(), dueDate: (rawDueDates[index] ?? '').trim() }))
      .filter((row) => row.assignee.length > 0);
    if (!routing.length) return fail(400, { error: 'Pick at least one reviewer.' });

    const { data: existing, error: existingError } = await projectClient
      .from('submittals')
      .select('id, number, title, spec_section, due_date, owner, status, revision, submitted_by')
      .eq('id', id)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (existingError) return fail(400, { error: existingError.message });
    if (!existing) return fail(404, { error: 'Submittal not found.' });

    const { count, error: countError } = await projectClient
      .from('submittal_routing_steps')
      .select('id', { count: 'exact', head: true })
      .eq('submittal_id', id);
    if (countError) return fail(400, { error: countError.message });
    if ((count ?? 0) > 0) return fail(400, { error: 'This submittal already has a routing chain.' });

    const memberError = await assertProjectMembers(
      projectClient,
      access.project.id,
      routing.map((row) => row.assignee),
      'Reviewers'
    );
    if (memberError) return fail(400, { error: memberError });

    const steps = routing.map((row, index) => ({
      submittal_id: id,
      step_order: index,
      assignee: row.assignee,
      role: 'member',
      due_date: row.dueDate || (index === 0 ? existing.due_date : null),
      status: nextStepStatus(index)
    }));
    const { error: routingError } = await projectClient.from('submittal_routing_steps').insert(steps);
    if (routingError) return fail(400, { error: routingError.message });

    const firstAssignee = routing[0].assignee;
    const { error: updateError } = await projectClient
      .from('submittals')
      .update({ owner: firstAssignee, current_step: 0, status: 'in_review' })
      .eq('id', id)
      .eq('project_id', access.project.id);
    if (updateError) return fail(400, { error: updateError.message });

    const sendEmails = form.get('sendEmails') === 'on';
    if (sendEmails) {
      const metadata = {
        projectSlug: access.project.slug,
        projectName: access.project.name,
        actorEmail: access.user.email,
        number: existing.number,
        title: existing.title,
        specSection: existing.spec_section,
        dueDate: existing.due_date,
        owner: firstAssignee,
        workflowAssigneeId: firstAssignee,
        submittedById: existing.submitted_by,
        stepIndex: 0,
        totalSteps: routing.length,
        revision: existing.revision ?? 0,
        previousStatus: existing.status,
        status: 'in_review'
      };
      await notifyProjectEvent(event, {
        projectId: access.project.id,
        actorId: access.user.id,
        type: 'submittal.action_required',
        entityType: 'submittal',
        entityId: id,
        metadata
      }).catch((error) => console.error('[notifications] submittal action-required notification failed:', error));
    }

    return { ok: true };
  },

  deleteSubmittal: async (event) => {
    const form = await event.request.formData();
    const id = formString(form, 'id');
    if (!id) return fail(400, { error: 'Choose a submittal to delete.' });
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'delete submittals for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return actionError('Supabase is not configured yet.');

    const { error } = await projectClient
      .from('submittals')
      .delete()
      .eq('id', id)
      .eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });
    return { ok: true };
  }
};
