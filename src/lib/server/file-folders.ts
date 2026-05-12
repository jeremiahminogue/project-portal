import { normalizeDocumentKind, type DocumentKind } from './drawing-ocr';

export function cleanFolderName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
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

export async function folderIdFor(
  client: NonNullable<App.Locals['supabase']>,
  projectId: string,
  folderName: unknown,
  userId: string,
  documentKind?: DocumentKind | string | null
) {
  const name = cleanFolderName(folderName);
  if (!name) return null;

  const normalizedKind = normalizeDocumentKind(documentKind) ?? 'file';
  const { data: existing, error: existingError } = await client
    .from('files')
    .select('id, document_kind')
    .eq('project_id', projectId)
    .eq('is_folder', true)
    .eq('name', name)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) {
    await updateFolderKind(client, existing.id as string, normalizedKind, existing.document_kind);
    return existing.id as string;
  }

  const { data: caseMatch, error: caseMatchError } = await client
    .from('files')
    .select('id, document_kind')
    .eq('project_id', projectId)
    .eq('is_folder', true)
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  if (caseMatchError) throw new Error(caseMatchError.message);
  if (caseMatch?.id) {
    await updateFolderKind(client, caseMatch.id as string, normalizedKind, caseMatch.document_kind);
    return caseMatch.id as string;
  }

  const { data: created, error: createError } = await client
    .from('files')
    .insert({
      project_id: projectId,
      name,
      is_folder: true,
      document_kind: normalizedKind,
      uploaded_by: userId
    })
    .select('id')
    .single();

  if (createError) throw new Error(createError.message);
  return created.id as string;
}
