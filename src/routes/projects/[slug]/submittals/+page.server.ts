import { fail } from '@sveltejs/kit';
import { actionError, formOptional, formString } from '$lib/server/auth';
import { notifyProjectEvent } from '$lib/server/notifications';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { getDirectory, getProject, getSubmittals } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const slug = event.params.slug;
  const [project, submittals, directory] = await Promise.all([
    getProject(event, slug),
    getSubmittals(event, slug),
    getDirectory(event, slug)
  ]);

  return { project, submittals, directory };
};

export const actions: Actions = {
  createSubmittal: async (event) => {
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const access = await requireProjectAccess(event, event.params.slug, {
      writable: true,
      action: 'create submittals for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);

    const number = formString(form, 'number');
    const title = formString(form, 'title');
    const specSection = formOptional(form, 'specSection');
    const dueDate = formOptional(form, 'dueDate');
    const owner = formOptional(form, 'owner');
    const notes = formOptional(form, 'notes');
    const sendEmails = form.get('sendEmails') === 'on';

    if (!number || !title) return fail(400, { error: 'Number and title are required.' });
    if (owner) {
      const { data: ownerMember, error: ownerError } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', access.project.id)
        .eq('user_id', owner)
        .maybeSingle();
      if (ownerError) return fail(400, { error: ownerError.message });
      if (!ownerMember) return fail(400, { error: 'Submittal owner must already belong to this project.' });
    }

    const { data: row, error } = await client
      .from('submittals')
      .insert({
        project_id: access.project.id,
        number,
        title,
        spec_section: specSection,
        submitted_date: new Date().toISOString().slice(0, 10),
        due_date: dueDate,
        owner,
        status: 'submitted',
        notes
      })
      .select('id')
      .single();

    if (error) return fail(400, { error: error.message });

    if (row?.id) {
      const routing = ['admin', 'member', 'guest', 'readonly'].map((role, index) => ({
        submittal_id: row.id,
        step_order: index,
        role,
        status: index === 0 ? 'submitted' : 'draft'
      }));
      const { error: routingError } = await client.from('submittal_routing_steps').insert(routing);
      if (routingError) return fail(400, { error: routingError.message });

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
          workflowAssigneeId: owner,
          skipUserIds: owner ? [owner] : [],
          status: 'submitted',
          notes
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
    const sendEmails = form.get('sendEmails') === 'on';

    if (!id || !['draft', 'submitted', 'in_review', 'approved', 'revise_resubmit', 'rejected'].includes(status)) {
      return fail(400, { error: 'Valid submittal status is required.' });
    }

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member', 'guest'],
      action: 'update submittals for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);

    const { data: existing, error: existingError } = await client
      .from('submittals')
      .select('id, number, title, spec_section, due_date, owner, status, decision, notes')
      .eq('id', id)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (existingError) return fail(400, { error: existingError.message });
    if (!existing) return fail(404, { error: 'Submittal not found.' });

    const { error } = await client
      .from('submittals')
      .update({ status, decision })
      .eq('id', id)
      .eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });

    const metadata = {
      projectSlug: access.project.slug,
      projectName: access.project.name,
      actorEmail: access.user.email,
      number: existing.number,
      title: existing.title,
      specSection: existing.spec_section,
      dueDate: existing.due_date,
      owner: existing.owner,
      workflowAssigneeId: existing.owner,
      previousStatus: existing.status,
      status,
      decision,
      notes: existing.notes
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
    } else if (sendEmails && decision && decision !== (existing.decision ?? '')) {
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
