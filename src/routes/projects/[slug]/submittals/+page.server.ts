import { fail } from '@sveltejs/kit';
import { actionError, formOptional, formString, requireUser } from '$lib/server/auth';
import { sendPortalEmail } from '$lib/server/email';
import { getDirectory, getProject, getProjectId, getSubmittals } from '$lib/server/queries';
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
    const me = await requireUser(event);
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const projectId = await getProjectId(event, event.params.slug);
    if (!projectId) return actionError('Project not found.', 404);

    const number = formString(form, 'number');
    const title = formString(form, 'title');
    const specSection = formOptional(form, 'specSection');
    const dueDate = formOptional(form, 'dueDate');
    const owner = formOptional(form, 'owner');
    const notes = formOptional(form, 'notes');

    if (!number || !title) return fail(400, { error: 'Number and title are required.' });

    const { data: row, error } = await client
      .from('submittals')
      .insert({
        project_id: projectId,
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
      await client.from('submittal_routing_steps').insert(routing);
    }

    await maybeNotifyAssignee(event, owner, `New submittal ${number}: ${title}`, me.profile?.full_name ?? me.user.email ?? 'Pueblo Electric');
    return { ok: true };
  },

  updateSubmittal: async (event) => {
    await requireUser(event);
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const id = formString(form, 'id');
    const status = formString(form, 'status');
    const decision = formOptional(form, 'decision');

    if (!id || !['draft', 'submitted', 'in_review', 'approved', 'revise_resubmit', 'rejected'].includes(status)) {
      return fail(400, { error: 'Valid submittal status is required.' });
    }

    const { error } = await client.from('submittals').update({ status, decision }).eq('id', id);
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
