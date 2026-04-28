import { fail } from '@sveltejs/kit';
import { formOptional, formString, requireSuperadmin } from '$lib/server/auth';
import { writeAdminAudit } from '$lib/server/admin-audit';
import { listAdminProjects } from '$lib/server/queries';
import { createAdminClient } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

const projectPhases = new Set(['pre_con', 'design', 'construction', 'closeout']);

function cleanSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 64);
}

function projectFields(form: FormData) {
  const name = formString(form, 'name');
  const slug = cleanSlug(formString(form, 'slug'));
  const customer = formString(form, 'customer');
  const phaseValue = formString(form, 'phase') || 'pre_con';
  const phase = projectPhases.has(phaseValue) ? phaseValue : 'pre_con';
  const percent = Math.max(0, Math.min(100, Number(formString(form, 'percentComplete') || 0)));

  return {
    name,
    slug,
    customer,
    phase,
    percent_complete: percent,
    address: formOptional(form, 'address'),
    ...(form.has('nextMilestone') ? { next_milestone: formOptional(form, 'nextMilestone') } : {}),
    ...(form.has('nextMilestoneDate') ? { next_milestone_date: formOptional(form, 'nextMilestoneDate') } : {})
  };
}

export const load: PageServerLoad = async (event) => {
  await requireSuperadmin(event);
  return { projects: await listAdminProjects() };
};

export const actions: Actions = {
  createProject: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const fields = projectFields(form);

    if (!fields.name || !fields.slug || !fields.customer) return fail(400, { error: 'Project name, number, and customer are required.' });

    const admin = createAdminClient();
    const { data, error } = await admin.from('projects').insert(fields).select('id, slug').single();

    if (error) return fail(400, { error: error.message });
    await writeAdminAudit(event, 'project.create', 'project', data.id, { slug: data.slug });
    return { ok: true };
  },

  updateProject: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const id = formString(form, 'id');
    const fields = projectFields(form);

    if (!id) return fail(400, { error: 'Project id is required.' });
    if (!fields.name || !fields.slug || !fields.customer) return fail(400, { error: 'Project name, number, and customer are required.' });

    const admin = createAdminClient();
    const { error } = await admin.from('projects').update(fields).eq('id', id);
    if (error) return fail(400, { error: error.message });
    await writeAdminAudit(event, 'project.update', 'project', id, { slug: fields.slug });
    return { ok: true };
  },

  deleteProject: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const id = formString(form, 'id');
    const confirmSlug = cleanSlug(formString(form, 'confirmSlug'));
    const slug = cleanSlug(formString(form, 'slug'));

    if (!id || !slug || confirmSlug !== slug) {
      return fail(400, { error: 'Type the project number exactly before deleting.' });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('projects').delete().eq('id', id);
    if (error) return fail(400, { error: error.message });
    await writeAdminAudit(event, 'project.delete', 'project', id, { slug });
    return { ok: true };
  }
};
