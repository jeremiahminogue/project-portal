import { json } from '@sveltejs/kit';
import { cleanFolderName, folderIdFor } from '$lib/server/file-folders';
import { databaseClientForProjectAccess, isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => null);
  const projectSlug = typeof body?.projectSlug === 'string' ? body.projectSlug : '';
  const name = cleanFolderName(body?.name);
  const documentKind = typeof body?.documentKind === 'string' ? body.documentKind : 'file';

  if (!projectSlug) return json({ error: 'Project is required.' }, { status: 400 });
  if (!name) return json({ error: 'Folder name is required.' }, { status: 400 });

  const access = await requireProjectAccess(event, projectSlug, { writable: true, action: 'create folders' });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ id: name, name, documentKind }, { status: 201 });

  try {
    const id = await folderIdFor(client, access.project.id, name, access.user.id, documentKind);
    return json({ id, name, documentKind }, { status: 201 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Folder could not be created.' }, { status: 500 });
  }
};

