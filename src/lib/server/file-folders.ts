import { normalizeDocumentKind, type DocumentKind } from './drawing-ocr';
import { isMissingFileSortOrderError } from './schema-compat';

export function cleanFolderName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

export function cleanFolderPath(value: unknown) {
  return String(value ?? '')
    .split(/[\\/]+/)
    .map((part) => cleanFolderName(part))
    .filter(Boolean)
    .slice(0, 8)
    .join('/');
}

async function updateFolderKind(
  client: NonNullable<App.Locals['supabase']>,
  folderId: string,
  documentKind: DocumentKind,
  currentDocumentKind?: string | null
) {
  if (currentDocumentKind === documentKind) return;
  const { error } = await client.from('files').update({ document_kind: documentKind }).eq('id', folderId).eq('is_folder', true);
  if (error) throw new Error(error.message);
}

async function findFolderByName(
  client: NonNullable<App.Locals['supabase']>,
  projectId: string,
  name: string,
  parentFolderId: string | null,
  caseInsensitive = false
) {
  let query = client
    .from('files')
    .select('id, document_kind')
    .eq('project_id', projectId)
    .eq('is_folder', true);

  query = caseInsensitive ? query.ilike('name', name) : query.eq('name', name);
  query = parentFolderId ? query.eq('parent_folder_id', parentFolderId) : query.is('parent_folder_id', null);

  return query.limit(1).maybeSingle();
}

export async function folderIdFor(
  client: NonNullable<App.Locals['supabase']>,
  projectId: string,
  folderName: unknown,
  userId: string,
  documentKind?: DocumentKind | string | null,
  parentFolderId: string | null = null
) {
  const path = cleanFolderPath(folderName);
  if (!path) return null;
  const normalizedKind = normalizeDocumentKind(documentKind) ?? 'file';
  let currentParentId = parentFolderId;

  for (const name of path.split('/')) {
    const { data: existing, error: existingError } = await findFolderByName(client, projectId, name, currentParentId);
    if (existingError) throw new Error(existingError.message);
    if (existing?.id) {
      await updateFolderKind(client, existing.id as string, normalizedKind, existing.document_kind);
      currentParentId = existing.id as string;
      continue;
    }

    const { data: caseMatch, error: caseMatchError } = await findFolderByName(client, projectId, name, currentParentId, true);
    if (caseMatchError) throw new Error(caseMatchError.message);
    if (caseMatch?.id) {
      await updateFolderKind(client, caseMatch.id as string, normalizedKind, caseMatch.document_kind);
      currentParentId = caseMatch.id as string;
      continue;
    }

    const { data: created, error: createError } = await client
      .from('files')
      .insert({
        project_id: projectId,
        parent_folder_id: currentParentId,
        name,
        is_folder: true,
        document_kind: normalizedKind,
        uploaded_by: userId
      })
      .select('id')
      .single();

    if (createError) throw new Error(createError.message);
    currentParentId = created.id as string;
  }

  return currentParentId;
}

export async function nextFileSortOrder(
  client: NonNullable<App.Locals['supabase']>,
  projectId: string,
  parentFolderId: string | null
) {
  let query = client
    .from('files')
    .select('sort_order')
    .eq('project_id', projectId)
    .eq('is_folder', false)
    .order('sort_order', { ascending: false })
    .limit(1);

  query = parentFolderId ? query.eq('parent_folder_id', parentFolderId) : query.is('parent_folder_id', null);
  const { data, error } = await query.maybeSingle();

  if (isMissingFileSortOrderError(error)) return null;
  if (error) throw new Error(error.message);
  return Number(data?.sort_order ?? 0) + 100;
}
