import { fail } from '@sveltejs/kit';
import { actionError, formOptional, formString } from '$lib/server/auth';
import { escapeHtml, sendPortalEmail } from '$lib/server/email';
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

    if (!title || !question) return fail(400, { error: 'Subject and question are required.' });
    if (!number) {
      try {
        number = await nextRfiNumber(client, access.project.id);
      } catch (error) {
        return fail(400, { error: error instanceof Error ? error.message : 'Could not create the next RFI number.' });
      }
    }
    if (assignedTo) {
      const { data: assignee, error: assigneeError } = await client
        .from('project_members')
        .select('id')
        .eq('project_id', access.project.id)
        .eq('user_id', assignedTo)
        .maybeSingle();
      if (assigneeError) return fail(400, { error: assigneeError.message });
      if (!assignee) return fail(400, { error: 'Assignee must already belong to this project.' });
    }

    const { error } = await client.from('rfis').insert({
      project_id: access.project.id,
      number,
      title,
      question,
      suggested_solution: suggestedSolution,
      reference,
      opened_date: new Date().toISOString().slice(0, 10),
      due_date: dueDate,
      assigned_to: assignedTo,
      assigned_org: assignedOrg,
      status: 'open'
    });

    if (error) return fail(400, { error: error.message });
    await maybeNotifyAssignee(event, assignedTo, `New RFI ${number}: ${title}`, access.user.email ?? 'Pueblo Electric');
    return { ok: true };
  },

  answerRfi: async (event) => {
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const id = formString(form, 'id');
    const answer = formString(form, 'answer');
    const status = answer ? 'answered' : formString(form, 'status');
    if (!id) return fail(400, { error: 'RFI id is required.' });
    if (!['open', 'answered', 'closed'].includes(status)) {
      return fail(400, { error: 'Valid RFI status is required.' });
    }

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member', 'guest'],
      action: 'update RFIs for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);

    const { error } = await client
      .from('rfis')
      .update({ answer, status })
      .eq('id', id)
      .eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });
    return { ok: true };
  }
};

async function maybeNotifyAssignee(event: Parameters<typeof requireProjectAccess>[0], userId: string | null, subject: string, sender: string) {
  if (!userId || !event.locals.supabase) return;
  const { data: profile } = await event.locals.supabase.from('profiles').select('email, full_name').eq('id', userId).maybeSingle();
  await sendPortalEmail({
    to: profile?.email,
    subject,
    html: `<p>${escapeHtml(sender)} assigned you a portal item.</p><p><strong>${escapeHtml(subject)}</strong></p>`
  });
}
