import { fail } from '@sveltejs/kit';
import { actionError, formOptional, formString, requireUser } from '$lib/server/auth';
import { sendPortalEmail } from '$lib/server/email';
import { getDirectory, getProject, getProjectId, getRfis } from '$lib/server/queries';
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

export const actions: Actions = {
  createRfi: async (event) => {
    const me = await requireUser(event);
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const projectId = await getProjectId(event, event.params.slug);
    if (!projectId) return actionError('Project not found.', 404);

    const number = formString(form, 'number');
    const title = formString(form, 'title') || number;
    const question = formString(form, 'question');
    const dueDate = formOptional(form, 'dueDate');
    const assignedTo = formOptional(form, 'assignedTo');
    const assignedOrg = formOptional(form, 'assignedOrg');

    if (!number || !question) return fail(400, { error: 'Number and question are required.' });

    const { error } = await client.from('rfis').insert({
      project_id: projectId,
      number,
      title,
      question,
      opened_date: new Date().toISOString().slice(0, 10),
      due_date: dueDate,
      assigned_to: assignedTo,
      assigned_org: assignedOrg,
      status: 'open'
    });

    if (error) return fail(400, { error: error.message });
    await maybeNotifyAssignee(event, assignedTo, `New RFI ${number}: ${title}`, me.profile?.full_name ?? me.user.email ?? 'Pueblo Electric');
    return { ok: true };
  },

  answerRfi: async (event) => {
    await requireUser(event);
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const id = formString(form, 'id');
    const answer = formString(form, 'answer');
    const status = answer ? 'answered' : formString(form, 'status');
    if (!id) return fail(400, { error: 'RFI id is required.' });

    const { error } = await client.from('rfis').update({ answer, status }).eq('id', id);
    if (error) return fail(400, { error: error.message });
    return { ok: true };
  }
};

async function maybeNotifyAssignee(event: Parameters<typeof requireUser>[0], userId: string | null, subject: string, sender: string) {
  if (!userId || !event.locals.supabase) return;
  const { data: profile } = await event.locals.supabase.from('profiles').select('email, full_name').eq('id', userId).maybeSingle();
  await sendPortalEmail({
    to: profile?.email,
    subject,
    html: `<p>${sender} assigned you a portal item.</p><p><strong>${subject}</strong></p>`
  });
}
