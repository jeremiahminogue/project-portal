import { fail } from '@sveltejs/kit';
import { formOptional, formString } from '$lib/server/auth';
import { databaseClientForProjectAccess, isProjectAccessError, projectRoleCapabilities, requireProjectAccess } from '$lib/server/project-access';
import { getDirectory, getProject } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

const contactTypes = new Set(['external', 'owner', 'ahj', 'reviewer']);

export const load: PageServerLoad = async (event) => {
  const [project, directory] = await Promise.all([getProject(event, event.params.slug), getDirectory(event, event.params.slug)]);
  const access = event.locals.supabase ? await requireProjectAccess(event, event.params.slug) : null;
  const role = access && !isProjectAccessError(access) ? access.role : null;
  return {
    project,
    directory,
    directoryAccess: {
      canManage: role ? projectRoleCapabilities[role].canManageDirectory : !event.locals.supabase,
      canDelete: role ? projectRoleCapabilities[role].canDeleteDirectoryContacts : !event.locals.supabase
    }
  };
};

export const actions: Actions = {
  saveContact: async (event) => {
    const form = await event.request.formData();
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member'],
      action: 'manage project contacts'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });
    const client = databaseClientForProjectAccess(event, access);
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const id = formOptional(form, 'id');
    const name = formString(form, 'name');
    const contactType = formString(form, 'contactType') || 'external';
    if (!name) return fail(400, { error: 'Contact name is required.' });
    if (!contactTypes.has(contactType)) return fail(400, { error: 'Choose a valid contact type.' });

    const values = {
      project_id: access.project.id,
      name,
      role: formOptional(form, 'role'),
      organization: formOptional(form, 'organization'),
      email: formOptional(form, 'email'),
      phone: formOptional(form, 'phone'),
      contact_type: contactType
    };
    const result = id
      ? await client.from('project_contacts').update(values).eq('id', id).eq('project_id', access.project.id)
      : await client.from('project_contacts').insert({ ...values, created_by: access.user.id });
    if (result.error) return fail(400, { error: result.error.message });
    return { ok: true };
  },

  deleteContact: async (event) => {
    const form = await event.request.formData();
    const id = formString(form, 'id');
    if (!id) return fail(400, { error: 'Choose a contact to delete.' });
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'delete project contacts'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });
    const client = databaseClientForProjectAccess(event, access);
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });
    const { error } = await client.from('project_contacts').delete().eq('id', id).eq('project_id', access.project.id);
    if (error) return fail(400, { error: error.message });
    return { ok: true };
  }
};
