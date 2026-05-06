export type FileLibraryTool = 'drawings' | 'specifications' | 'documents';

export type FileLibraryItem = {
  name: string;
  path: string;
  type?: string | null;
  tags?: string[] | null;
  documentKind?: 'drawing' | 'specification' | 'file' | string | null;
  linkedItemKinds?: string[] | null;
};

const generalDocumentFolders = new Set([
  'documents',
  'general documents',
  'meeting notes',
  'contract',
  'change order',
  'close out documents',
  'estimate info',
  'notice to proceed',
  "o&m's",
  'pictures',
  'purchase orders',
  'safety',
  'schedules'
]);

export function folderName(file: FileLibraryItem) {
  return file.path.includes('/') ? file.path.split('/')[0] : 'General';
}

function normalizedFolderName(file: FileLibraryItem) {
  return folderName(file)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isCommunicationFolder(file: FileLibraryItem) {
  const folder = normalizedFolderName(file);
  return folder === 'rfi' || folder === 'rfis' || folder === 'submittal' || folder === 'submittals' || /^rfi\b.*\battachments$/.test(folder) || /^submittal\b.*\battachments$/.test(folder);
}

export function isItemAssociatedFile(file: FileLibraryItem) {
  if ((file.linkedItemKinds?.length ?? 0) > 0) return true;
  if (file.tags?.some((tag) => tag.toLowerCase() === 'attachment')) return true;
  return isCommunicationFolder(file);
}

export function isSpecificationFile(file: FileLibraryItem) {
  if (isItemAssociatedFile(file) && file.documentKind !== 'specification') return false;
  const haystack = `${file.name} ${file.path} ${file.tags?.join(' ') ?? ''}`.toLowerCase();
  if (file.documentKind === 'specification') return true;
  if (/\bspec(?:s|ification|ifications)?\b/.test(haystack) || haystack.includes('project manual') || /\bdivision\s+\d{1,2}\b/.test(haystack)) {
    return true;
  }
  if (file.documentKind === 'drawing') return false;
  return false;
}

export function isGeneralDocumentFile(file: FileLibraryItem) {
  if (isItemAssociatedFile(file)) return false;
  if (isSpecificationFile(file)) return false;
  const folder = folderName(file).toLowerCase();
  if (generalDocumentFolders.has(folder)) return true;
  return file.documentKind === 'file' || file.type !== 'pdf';
}

export function isDrawingFile(file: FileLibraryItem) {
  if (file.documentKind === 'drawing') return true;
  if (isItemAssociatedFile(file)) return false;
  return !isSpecificationFile(file) && !isGeneralDocumentFile(file);
}

export function fileMatchesTool(file: FileLibraryItem, tool: FileLibraryTool) {
  if (tool === 'specifications') return isSpecificationFile(file);
  if (tool === 'documents') return isGeneralDocumentFile(file);
  return isDrawingFile(file);
}
