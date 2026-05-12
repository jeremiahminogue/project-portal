type DatabaseError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

const projectMemberManagerFlagColumns = ['is_submittal_manager', 'is_rfi_manager'];
const fileSortOrderColumns = ['sort_order'];

function errorText(error: unknown) {
  const dbError = error as DatabaseError | null;
  return [dbError?.message, dbError?.details, dbError?.hint].filter(Boolean).join(' ').toLowerCase();
}

export function isMissingProjectMemberManagerFlagError(error: unknown) {
  const dbError = error as DatabaseError | null;
  const text = errorText(error);
  const mentionsManagerFlag = projectMemberManagerFlagColumns.some((column) => text.includes(column));
  if (!mentionsManagerFlag) return false;

  return (
    dbError?.code === '42703' ||
    dbError?.code === 'PGRST204' ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  );
}

export function isMissingFileSortOrderError(error: unknown) {
  const dbError = error as DatabaseError | null;
  const text = errorText(error);
  const mentionsSortOrder = fileSortOrderColumns.some((column) => text.includes(column));
  if (!mentionsSortOrder) return false;

  return (
    dbError?.code === '42703' ||
    dbError?.code === 'PGRST204' ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  );
}

export function stripProjectMemberManagerFlags<T extends Record<string, unknown>>(payload: T) {
  const copy = { ...payload };
  delete copy.is_submittal_manager;
  delete copy.is_rfi_manager;
  return copy;
}

export async function projectMemberManagerFlagsAvailable(client: any) {
  const { error } = await client
    .from('project_members')
    .select('is_submittal_manager, is_rfi_manager')
    .limit(1);

  if (!error) return true;
  if (isMissingProjectMemberManagerFlagError(error)) return false;
  throw new Error(error.message);
}
