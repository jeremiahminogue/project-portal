import { fail } from '@sveltejs/kit';
import { formOptional, formString, requireSuperadmin } from '$lib/server/auth';
import { listAdminProjects } from '$lib/server/queries';
import { createAdminClient } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  return { projects: await listAdminProjects() };
};

export const actions: Actions = {
  createProject: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const name = formString(form, 'name');
    const slug = formString(form, 'slug').toLowerCase();
    const customer = formString(form, 'customer');
    const address = formOptional(form, 'address');
    const phase = formString(form, 'phase') || 'pre_con';
    const percent = Math.max(0, Math.min(100, Number(formString(form, 'percentComplete') || 0)));

    if (!name || !slug || !customer) return fail(400, { error: 'Project name, number, and customer are required.' });

    const admin = createAdminClient();
    const { error } = await admin.from('projects').insert({
      name,
      slug,
      customer,
      address,
      phase,
      percent_complete: percent,
      next_milestone: formOptional(form, 'nextMilestone'),
      next_milestone_date: formOptional(form, 'nextMilestoneDate')
    });

    if (error) return fail(400, { error: error.message });
    return { ok: true };
  }
};
