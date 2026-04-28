import { fail } from '@sveltejs/kit';
import { actionError, formOptional, formString } from '$lib/server/auth';
import { escapeHtml, sendPortalEmail } from '$lib/server/email';
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
    }

    await maybeNotifyAssignee(event, owner, `New submittal ${number}: ${title}`, access.user.email ?? 'Pueblo Electric');
    return { ok: true };
  },

  updateSubmittal: async (event) => {
    const client = event.locals.supabase;
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const id = formString(form, 'id');
    const status = formString(form, 'status');
    const decision = formOptional(form, 'decision');

    if (!id || !['draft', 'submitted', 'in_review', 'approved', 'revise_resubmit', 'rejected'].includes(status)) {
      return fail(400, { error: 'Valid submittal status is required.' });
    }

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member', 'guest'],
      action: 'update submittals for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);

    const { error } = await client
      .from('submittals')
      .update({ status, decision })
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
