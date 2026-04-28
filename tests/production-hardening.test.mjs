import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function file(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('production auth fails closed and protects file APIs', () => {
  const hooks = file('src/hooks.server.ts');
  const protectedPathBody = hooks.match(/function isProtectedPath[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(hooks, /isProductionRuntime\(\)/);
  assert.match(hooks, /Portal authentication is not configured/);
  assert.match(hooks, /requiresAuthConfig\(pathname\)/);
  assert.match(hooks, /pathname === '\/login'/);
  assert.match(hooks, /pathname === '\/reset-password'/);
  assert.doesNotMatch(protectedPathBody, /pathname === '\/login'/);
  assert.doesNotMatch(protectedPathBody, /pathname === '\/reset-password'/);
  assert.match(hooks, /pathname\.startsWith\('\/api\/files'\)/);
});

test('password reset flow uses callback session before updateUser', () => {
  const forgot = file('src/routes/forgot-password/+page.server.ts');
  const reset = file('src/routes/reset-password/+page.server.ts');
  const login = file('src/routes/login/+page.svelte');
  const callback = file('src/routes/auth/callback/+server.ts');
  assert.match(forgot, /resetPasswordForEmail/);
  assert.match(forgot, /\/auth\/callback\?next=\/reset-password/);
  assert.match(forgot, /isRateLimitError/);
  assert.match(forgot, /limited: true/);
  assert.match(reset, /exchangeCodeForSession/);
  assert.match(reset, /searchParams\.get\('error'\)/);
  assert.match(reset, /updateUser\(\{ password \}\)/);
  assert.match(callback, /next === '\/reset-password'/);
  assert.match(login, /href="\/forgot-password"/);
});

test('local superadmin fallback is explicitly gated outside production', () => {
  const env = file('src/lib/server/env.ts');
  const localAuth = file('src/lib/server/local-auth.ts');
  const superadmin = file('src/lib/server/superadmin.ts');
  assert.match(env, /PORTAL_ENABLE_LOCAL_SUPERADMIN/);
  assert.match(env, /!isProductionRuntime\(\)/);
  assert.match(env, /process\.env\.VERCEL_ENV/);
  assert.doesNotMatch(env, /serverEnv\('VERCEL_ENV'\)/);
  assert.match(localAuth, /isLocalSuperadminEnabled\(\)/);
  assert.doesNotMatch(superadmin, /auth\.admin\.(createUser|updateUserById)/);
});

test('RFI and submittal writes are bound to project access and project id', () => {
  for (const path of [
    'src/routes/projects/[slug]/rfis/+page.server.ts',
    'src/routes/projects/[slug]/submittals/+page.server.ts'
  ]) {
    const source = file(path);
    assert.match(source, /requireProjectAccess/);
    assert.match(source, /\.eq\('project_id', access\.project\.id\)/);
  }
});

test('RFI form captures construction request fields', () => {
  const rfiServer = file('src/routes/projects/[slug]/rfis/+page.server.ts');
  const rfiUi = file('src/routes/projects/[slug]/rfis/+page.svelte');
  const queries = file('src/lib/server/queries.ts');
  const migration = file('supabase/migrations/0008_rfi_fields_and_update_attachments.sql');
  assert.match(rfiServer, /formString\(form, 'subject'\)/);
  assert.match(rfiServer, /suggested_solution: suggestedSolution/);
  assert.match(rfiServer, /reference/);
  assert.match(rfiUi, /name="suggestedSolution"/);
  assert.match(rfiUi, /Suggested solution/);
  assert.match(rfiUi, /Reference/);
  assert.match(queries, /suggested_solution/);
  assert.match(migration, /add column if not exists suggested_solution text/);
});

test('admin access email does not include plaintext temporary passwords', () => {
  const users = file('src/routes/admin/users/+page.server.ts');
  const usersUi = file('src/routes/admin/users/+page.svelte');
  assert.doesNotMatch(users, /temporary password is/i);
  assert.doesNotMatch(users, /createUser\(\{[\s\S]*password/);
  assert.doesNotMatch(users, /tempPassword/);
  assert.doesNotMatch(usersUi, /name="password"/);
  assert.match(users, /escapeHtml/);
});

test('admin page loads enforce superadmin access directly', () => {
  for (const path of [
    'src/routes/admin/+page.server.ts',
    'src/routes/admin/projects/+page.server.ts',
    'src/routes/admin/users/+page.server.ts'
  ]) {
    const source = file(path);
    assert.match(source, /requireSuperadmin\(event\)/);
  }
});

test('OCR reindex preserves good metadata while allowing page skeleton repair', () => {
  const source = file('src/routes/api/files/[id]/reindex/+server.ts');
  assert.match(source, /if \(!ocr\.completed\)/);
  assert.match(source, /ocrDeferred: true/);
  assert.match(source, /drawing_pages/);
  assert.match(source, /shouldReplaceDeferredPages/);
  assert.match(source, /file\.page_count/);
  assert.match(source, /replaceDrawingPages/);
});

test('file APIs are Vercel-safe and storage failures are handled', () => {
  const uploadButton = file('src/lib/components/FileUploadButton.svelte');
  const fileRoute = file('src/routes/api/files/[id]/+server.ts');
  const downloadRoute = file('src/routes/api/files/[id]/download/+server.ts');
  const uploadUrlRoute = file('src/routes/api/files/upload-url/+server.ts');
  const registerRoute = file('src/routes/api/files/+server.ts');
  const objectStorage = file('src/lib/server/object-storage.ts');
  const ingest = file('src/lib/server/file-ingest.ts');
  const uploadSession = file('src/lib/server/upload-session.ts');
  assert.match(uploadButton, /\/api\/files\/upload-url/);
  assert.match(uploadButton, /method: 'PUT'/);
  assert.match(uploadButton, /uploadThroughPortal/);
  assert.match(uploadButton, /error\.stage !== 'storage'/);
  assert.match(uploadButton, /\/api\/files'/);
  assert.match(uploadButton, /uploadToken: uploadUrl\.uploadToken/);
  assert.match(uploadUrlRoute, /typeof sizeBytes !== 'number'/);
  assert.match(uploadUrlRoute, /issueUploadSession/);
  assert.match(registerRoute, /verifyUploadSession/);
  assert.match(registerRoute, /isProjectStorageKey/);
  assert.match(registerRoute, /headObject\(key\)/);
  assert.match(registerRoute, /Uploaded object metadata did not match/);
  assert.match(registerRoute, /deleteObject\(key\)/);
  assert.match(ingest, /registerUploadedFile/);
  assert.match(ingest, /analyzeDrawingUploadSafely/);
  assert.match(ingest, /drawing_pages/);
  assert.match(uploadSession, /timingSafeEqual/);
  assert.match(uploadSession, /projectStoragePrefix/);
  assert.match(fileRoute, /storage cleanup after database delete failed/);
  assert.match(fileRoute, /warning: 'File was removed from the portal, but object storage cleanup failed.'/);
  assert.match(downloadRoute, /storageErrorMessage\(error, 'read this file'\)/);
  assert.match(uploadUrlRoute, /storageErrorMessage\(error, 'prepare the upload'\)/);
  assert.match(objectStorage, /function signature/);
  assert.match(objectStorage, /export async function headObject/);
  assert.match(objectStorage, /'content-type': contentType/);
  assert.match(objectStorage, /fetch\(url/);
  assert.doesNotMatch(objectStorage, /@aws-sdk/);
});

test('PDF page indexing does not collapse when OCR fails or defers', () => {
  const drawingOcr = file('src/lib/server/drawing-ocr.ts');
  const ocrProcessing = file('src/lib/server/ocr-processing.ts');
  const ingest = file('src/lib/server/file-ingest.ts');
  const reindex = file('src/routes/api/files/[id]/reindex/+server.ts');
  assert.match(drawingOcr, /extractPdfPageSkeleton/);
  assert.match(drawingOcr, /PDFDocument\.load/);
  assert.match(drawingOcr, /analysisFromPages\(documentKind, fallback, pages, 'failed'\)/);
  assert.match(ocrProcessing, /basicDrawingAnalysisFromBytes/);
  assert.match(ocrProcessing, /shouldIndexPdfPages/);
  assert.match(ingest, /shouldLoadForIndexing/);
  assert.match(reindex, /shouldReplaceDeferredPages/);
});

test('production hardening migration adds review RLS and audit log', () => {
  const migration = file('supabase/migrations/0006_production_hardening.sql');
  assert.match(migration, /can_project_write/);
  assert.match(migration, /can_project_review/);
  assert.match(migration, /Project reviewers can update RFIs/);
  assert.match(migration, /Project reviewers can update submittals/);
  assert.match(migration, /create table if not exists admin_audit_log/);
});

test('project roles have explicit production capabilities', () => {
  const access = file('src/lib/server/project-access.ts');
  const filesPage = file('src/routes/projects/[slug]/files/+page.server.ts');
  assert.match(access, /projectRoleCapabilities/);
  assert.match(access, /canUploadFiles/);
  assert.match(access, /canDeleteChat/);
  assert.match(access, /guest:\s*\{[\s\S]*canUploadFiles: false/);
  assert.match(access, /readonly:\s*\{[\s\S]*canCreateCommunication: false/);
  assert.match(filesPage, /projectRoleCapabilities\[role\]\.canUploadFiles/);
  assert.match(filesPage, /projectRoleCapabilities\[role\]\.canReindexFiles/);
});

test('chat admin deletion and activity hardening are present', () => {
  const chatServer = file('src/routes/projects/[slug]/chat/+page.server.ts');
  const chatUi = file('src/routes/projects/[slug]/chat/+page.svelte');
  const migration = file('supabase/migrations/0007_chat_and_upload_permissions.sql');
  assert.match(chatServer, /roles: \['superadmin', 'admin'\]/);
  assert.match(chatServer, /deleteSubject/);
  assert.match(chatServer, /deleteMessage/);
  assert.match(chatServer, /touchError/);
  assert.match(chatUi, /data\.chatAccess\?\.canDelete/);
  assert.match(chatUi, /Trash2/);
  assert.match(migration, /chat_messages_touch_subject/);
  assert.match(migration, /Project admins can delete chat subjects/);
  assert.match(migration, /Project admins can delete chat messages/);
});

test('viewer does not force non-PDF files into the PDF renderer', () => {
  const filesPage = file('src/routes/projects/[slug]/files/+page.svelte');
  const viewer = file('src/routes/projects/[slug]/files/[id]/+page.svelte');
  const viewerServer = file('src/routes/projects/[slug]/files/[id]/+page.server.ts');
  assert.match(filesPage, /function fileIsPdf/);
  assert.match(filesPage, /fileHasStorage\(file\) && fileIsPdf\(file\)/);
  assert.match(viewer, /const isPdf/);
  assert.match(viewer, /{:else if isImage}/);
  assert.match(viewer, /Preview is not available for this file type/);
  assert.match(viewerServer, /contentTypeFromName/);
});

test('updates can attach project files and files include a documents view', () => {
  const updatesServer = file('src/routes/projects/[slug]/updates/+page.server.ts');
  const updatesUi = file('src/routes/projects/[slug]/updates/+page.svelte');
  const filesPage = file('src/routes/projects/[slug]/files/+page.svelte');
  const nav = file('src/lib/components/ProjectNav.svelte');
  const queries = file('src/lib/server/queries.ts');
  assert.match(updatesServer, /updateAttachmentsFor/);
  assert.match(updatesServer, /attachments_json: attachments/);
  assert.match(updatesUi, /name="attachmentIds"/);
  assert.match(updatesUi, /attachment-chip/);
  assert.match(queries, /normalizeUpdateAttachments/);
  assert.match(filesPage, /isGeneralDocument/);
  assert.match(filesPage, /tool'\) === 'documents'/);
  assert.match(nav, /label: 'Documents'/);
});

test('project overview supports progress tracking and photo uploads', () => {
  const projectServer = file('src/routes/projects/[slug]/+page.server.ts');
  const projectUi = file('src/routes/projects/[slug]/+page.svelte');
  const access = file('src/lib/server/project-access.ts');
  const uploadButton = file('src/lib/components/FileUploadButton.svelte');
  const migration = file('supabase/migrations/0009_project_progress_updates.sql');
  assert.match(projectServer, /updateProgress/);
  assert.match(projectServer, /percent_complete: percent/);
  assert.match(projectServer, /next_milestone_date: nextMilestoneDate/);
  assert.match(projectUi, /Project progress/);
  assert.match(projectUi, /Progress photos/);
  assert.match(projectUi, /buttonLabel="Upload photos"/);
  assert.match(uploadButton, /accept\?: string/);
  assert.match(uploadButton, /\{accept\}/);
  assert.match(access, /canEditProjectProgress/);
  assert.match(migration, /Project members can update project progress/);
  assert.match(migration, /public\.can_project_write\(id, auth\.uid\(\)\)/);
});
