import type { RequestEvent } from '@sveltejs/kit';
import type {
  ChatSubject,
  DirectoryEntry,
  FileEntry,
  FolderEntry,
  Project,
  RFI,
  ScheduleActivity,
  StatusChip,
  Submittal,
  Update
} from './mock-data/types';
import {
  chatSubjects as mockChatSubjects,
  directory as mockDirectory,
  files as mockFiles,
  folders as mockFolders,
  projects as mockProjects,
  rfis as mockRfis,
  scheduleActivities as mockSchedule,
  submittals as mockSubmittals,
  updates as mockUpdates
} from './mock-data';
import { bytesToSize, relativeTime } from '$lib/utils';
import { isProductionRuntime } from './env';
import { loadItemAttachmentLinks, normalizeItemAttachments } from './item-attachments';
import { encodeStorageId, hasObjectStorageConfig, listProjectObjects } from './object-storage';
import { createAdminClient, hasSupabaseAdminConfig } from './supabase-admin';
import { isMissingProjectMemberManagerFlagError, projectMemberManagerFlagsAvailable } from './schema-compat';

type EventLike = Pick<RequestEvent, 'locals'>;

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  company: string | null;
  title: string | null;
};

export type PortalFile = FileEntry & {
  parentFolderId?: string | null;
  storageKey?: string | null;
  mimeType?: string | null;
  documentKind?: 'drawing' | 'specification' | 'file';
  linkedItemKinds?: ('rfi' | 'submittal')[];
  sheetNumber?: string | null;
  sheetTitle?: string | null;
  revision?: string | null;
  pageCount?: number;
  ocrStatus?: 'pending' | 'indexed' | 'partial' | 'failed' | 'skipped';
  pages?: DrawingPage[];
};

export type DrawingPage = {
  id: string;
  pageNumber: number;
  name: string;
  sheetNumber: string | null;
  sheetTitle: string | null;
  revision: string | null;
};

export type PortalSubmittal = Submittal & {
  id?: string;
  currentStep?: number;
  submittedBy?: string | null;
  submittedById?: string | null;
};

export type PortalRfi = RFI & {
  id?: string;
  title?: string;
  suggestedSolution?: string | null;
  reference?: string | null;
  assignedToId?: string | null;
  createdById?: string | null;
  rfiManagerId?: string | null;
  rfiManager?: string;
};

type UpdateAttachment = NonNullable<Update['attachments']>[number];

function normalizeUpdateAttachments(value: unknown): UpdateAttachment[] {
  return normalizeItemAttachments(value) as UpdateAttachment[];
}

const phaseToStatus: Record<string, Project['status']> = {
  pre_con: 'Pre-Con',
  design: 'Design',
  construction: 'Construction',
  closeout: 'Closed'
};

function supabase(event: EventLike) {
  if (event.locals.isLocalSuperadmin) return createAdminClient();
  return event.locals.supabase;
}

async function profilesByIds(client: any, ids: Array<string | null | undefined>): Promise<Map<string, ProfileLite>> {
  const uniqueIds = [...new Set(ids.filter(Boolean) as string[])];
  if (uniqueIds.length === 0) return new Map<string, ProfileLite>();

  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, email, company, title')
    .in('id', uniqueIds);

  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  return new Map<string, ProfileLite>((data ?? []).map((profile: ProfileLite) => [profile.id, profile]));
}

function profileDisplayName(profile: ProfileLite | undefined | null, fallback = '') {
  return profile?.full_name ?? profile?.email ?? fallback;
}

async function currentUserId(event: EventLike) {
  try {
    const me = await event.locals.getCurrentUser?.();
    return me?.user?.id ?? null;
  } catch {
    return null;
  }
}

function arrayJson<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function rowToProject(row: any, stats?: { submittals?: number; rfis?: number; actions?: number; activity?: string }) {
  return {
    id: row.slug,
    number: `#${row.slug}`,
    title: row.name,
    address: row.address ?? '',
    owner: row.customer,
    status: phaseToStatus[row.phase] ?? 'Pre-Con',
    completionPercent: row.percent_complete ?? 0,
    targetComplete: row.next_milestone_date ?? '',
    nextMilestone: row.next_milestone ?? '',
    nextMilestoneDate: row.next_milestone_date ?? '',
    openSubmittals: stats?.submittals ?? 0,
    openRfis: stats?.rfis ?? 0,
    actionItems: stats?.actions ?? 0,
    lastActivity: stats?.activity ?? '',
    lastActivityTime: row.updated_at ? relativeTime(row.updated_at) : '',
    lastActivityAuthor: stats?.activity ? 'Project team' : 'PE'
  } satisfies Project;
}

export async function getProjectId(event: EventLike, slug: string) {
  const client = supabase(event);
  if (!client) return slug;
  const { data, error } = await client.from('projects').select('id').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`getProjectId failed: ${error.message}`);
  return data?.id ?? null;
}

export async function getProjects(event: EventLike): Promise<Project[]> {
  const client = supabase(event);
  if (!client) return mockProjects;

  const { data, error } = await client
    .from('projects')
    .select('id, slug, name, customer, address, phase, percent_complete, next_milestone, next_milestone_date, updated_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getProjects failed: ${error.message}`);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((row: any) => row.id);
  const [subs, rfis] = await Promise.all([
    client.from('submittals').select('project_id, status').in('project_id', ids),
    client.from('rfis').select('project_id, status').in('project_id', ids)
  ]);

  const stats = new Map<string, { submittals: number; rfis: number; actions: number }>();
  for (const id of ids) stats.set(id, { submittals: 0, rfis: 0, actions: 0 });
  for (const sub of subs.data ?? []) {
    if (['approved', 'rejected'].includes(sub.status)) continue;
    const row = stats.get(sub.project_id);
    if (row) {
      row.submittals += 1;
      row.actions += 1;
    }
  }
  for (const rfi of rfis.data ?? []) {
    if (rfi.status !== 'open') continue;
    const row = stats.get(rfi.project_id);
    if (row) {
      row.rfis += 1;
      row.actions += 1;
    }
  }

  return rows.map((row: any) => rowToProject(row, stats.get(row.id)));
}

export async function getProject(event: EventLike, slug: string): Promise<Project | null> {
  const client = supabase(event);
  if (!client) return mockProjects.find((project) => project.id === slug) ?? null;

  const { data, error } = await client
    .from('projects')
    .select('id, slug, name, customer, address, phase, percent_complete, next_milestone, next_milestone_date, updated_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(`getProject failed: ${error.message}`);
  if (!data) return null;
  const [subs, rfis, updates] = await Promise.all([
    client.from('submittals').select('status').eq('project_id', data.id),
    client.from('rfis').select('status').eq('project_id', data.id),
    client.from('updates').select('title, created_at').eq('project_id', data.id).order('created_at', { ascending: false }).limit(1)
  ]);
  const openSubmittals = (subs.data ?? []).filter((sub: any) => !['approved', 'rejected'].includes(sub.status)).length;
  const openRfis = (rfis.data ?? []).filter((rfi: any) => rfi.status === 'open').length;
  return rowToProject(data, {
    submittals: openSubmittals,
    rfis: openRfis,
    actions: openSubmittals + openRfis,
    activity: updates.data?.[0]?.title ?? data.next_milestone ?? ''
  });
}

export async function getSchedule(event: EventLike, slug: string): Promise<ScheduleActivity[]> {
  const client = supabase(event);
  if (!client) return mockSchedule;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const scheduleSelect =
    'id, phase, title, activity_type, start_date, end_date, owner, status, is_blackout, predecessor_id, predecessor_refs, source_order, source_wbs, percent_complete';
  const legacyScheduleSelect =
    'id, phase, title, activity_type, start_date, end_date, owner, status, is_blackout, predecessor_id, percent_complete';
  let result: any = await client
    .from('schedule_activities')
    .select(scheduleSelect)
    .eq('project_id', projectId)
    .order('source_order', { ascending: true, nullsFirst: false })
    .order('start_date', { ascending: true });

  if (result.error?.code === '42703') {
    result = await client
      .from('schedule_activities')
      .select(legacyScheduleSelect)
      .eq('project_id', projectId)
      .order('start_date', { ascending: true });
  }

  const { data, error } = result;
  if (error) throw new Error(`getSchedule failed: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    phase: row.phase,
    title: row.title,
    type: row.activity_type ?? 'internal',
    startDate: row.start_date,
    endDate: row.end_date,
    owner: row.owner ?? '',
    status: row.status as StatusChip,
    isBlackout: Boolean(row.is_blackout),
    predecessorId: row.predecessor_id,
    predecessorRefs: row.predecessor_refs,
    sourceOrder: row.source_order,
    sourceWbs: row.source_wbs,
    percentComplete: row.percent_complete ?? 0
  }));
}

const submittalStatusLabel: Record<string, Submittal['status']> = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_review: 'In Review',
  approved: 'Approved',
  revise_resubmit: 'Revise & Resubmit',
  rejected: 'Rejected'
};

const rfiStatusLabel: Record<string, RFI['status']> = {
  open: 'Open',
  answered: 'Answered',
  closed: 'Closed'
};

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function getSubmittals(event: EventLike, slug: string): Promise<PortalSubmittal[]> {
  const client = supabase(event);
  if (!client) return mockSubmittals;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const { data, error } = await client
    .from('submittals')
    .select(
      `id, number, title, spec_section, submitted_date, due_date, status, current_step, notes,
      decision, attachments_json, revision, submit_by, received_from, submitted_by,
      owner,
      submittal_routing_steps (id, step_order, role, assignee, status, due_date, response, required, signed_off_at)`
    )
    .eq('project_id', projectId)
    .order('submitted_date', { ascending: false });

  if (error) throw new Error(`getSubmittals failed: ${error.message}`);
  const rows = data ?? [];
  const profileIds = rows.flatMap((row: any) => [
    row.owner,
    row.received_from,
    row.submitted_by,
    ...(row.submittal_routing_steps ?? []).map((step: any) => step.assignee)
  ]);
  const [profiles, attachmentLinks] = await Promise.all([
    profilesByIds(client, profileIds),
    loadItemAttachmentLinks(client, 'submittal', rows.map((row: any) => row.id))
  ]);

  return rows.map((row: any) => {
    const owner = profiles.get(row.owner);
    const receivedFrom = profiles.get(row.received_from);
    const submittedBy = profiles.get(row.submitted_by);
    const steps = [...(row.submittal_routing_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      specSection: row.spec_section ?? '',
      submittedDate: row.submitted_date ?? '',
      dueDate: row.due_date ?? '',
      owner: profileDisplayName(owner),
      ownerId: row.owner,
      status: submittalStatusLabel[row.status] ?? 'Draft',
      currentStep: row.current_step ?? 0,
      notes: row.notes,
      decision: row.decision,
      revision: row.revision ?? 0,
      submitBy: row.submit_by,
      receivedFrom: profileDisplayName(receivedFrom),
      receivedFromId: row.received_from,
      submittedBy: profileDisplayName(submittedBy),
      submittedById: row.submitted_by,
      attachments: attachmentLinks?.get(row.id) ?? normalizeItemAttachments(row.attachments_json),
      routingSteps: steps.map((step: any) => {
        const profile = profiles.get(step.assignee);
        return {
          id: step.id,
          order: step.step_order ?? 0,
          assigneeId: step.assignee,
          assignee: profileDisplayName(profile, step.role ?? 'Reviewer'),
          role: profile?.company ?? step.role ?? 'Reviewer',
          status: submittalStatusLabel[step.status] ?? 'Draft',
          dueDate: step.due_date,
          response: step.response,
          required: step.required !== false,
          completedAt: step.signed_off_at
        };
      }),
      routing: steps.map((step: any) => {
        const profile = profiles.get(step.assignee);
        return profileDisplayName(profile, step.role ?? 'Reviewer');
      })
    };
  });
}

export async function getRfis(event: EventLike, slug: string): Promise<PortalRfi[]> {
  const client = supabase(event);
  if (!client) return mockRfis;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const { data, error } = await client
    .from('rfis')
    .select('id, number, title, question, suggested_solution, reference, opened_date, due_date, assigned_to, assigned_org, created_by, rfi_manager_id, status, answer, attachments_json, distribution_json, activity_json')
    .eq('project_id', projectId)
    .order('opened_date', { ascending: false });

  if (error) throw new Error(`getRfis failed: ${error.message}`);
  const rows = data ?? [];
  const [profiles, attachmentLinks] = await Promise.all([
    profilesByIds(
      client,
      rows.flatMap((row: any) => [
        row.assigned_to,
        row.rfi_manager_id,
        row.created_by,
        ...arrayJson<string>(row.distribution_json)
      ])
    ),
    loadItemAttachmentLinks(client, 'rfi', rows.map((row: any) => row.id))
  ]);

  return rows.map((row: any) => {
    const assigned = profiles.get(row.assigned_to);
    const manager = profiles.get(row.rfi_manager_id);
    const distributionIds = arrayJson<string>(row.distribution_json);
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      question: row.question ?? '',
      suggestedSolution: row.suggested_solution ?? '',
      reference: row.reference ?? '',
      openedDate: row.opened_date ?? '',
      dueDate: row.due_date ?? '',
      assignedToId: row.assigned_to,
      assignedTo: profileDisplayName(assigned),
      assignedOrg: row.assigned_org ?? '',
      createdById: row.created_by,
      rfiManagerId: row.rfi_manager_id,
      rfiManager: profileDisplayName(manager),
      status: rfiStatusLabel[row.status] ?? 'Open',
      answer: row.answer,
      distributionIds,
      distribution: distributionIds.map((id) => profileDisplayName(profiles.get(id), id)),
      activity: arrayJson(row.activity_json),
      attachments: attachmentLinks?.get(row.id) ?? normalizeItemAttachments(row.attachments_json)
    };
  });
}

function mimeToType(mime: string | null): FileEntry['type'] {
  if (!mime) return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('word') || mime.includes('wordprocessingml')) return 'docx';
  if (mime.includes('excel') || mime.includes('spreadsheetml')) return 'xlsx';
  return 'pdf';
}

function fileTypeFromName(name: string, mime?: string | null): FileEntry['type'] {
  if (mime) return mimeToType(mime);
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext ?? '')) return 'image';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'xlsx';
  return 'pdf';
}

function cleanStorageName(name: string) {
  return name.replace(/^[a-f0-9]{8}-/i, '');
}

function isMissingAttachmentLinkTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return code === '42P01' || code === '42703' || /relation .*_attachments.* does not exist/i.test(message);
}

async function linkedAttachmentFileIds(
  client: NonNullable<App.Locals['supabase']>,
  table: 'rfi_attachments' | 'submittal_attachments',
  projectId: string,
  fileIds: string[]
) {
  if (!fileIds.length) return [];

  const { data, error } = await client
    .from(table)
    .select('file_id')
    .eq('project_id', projectId)
    .in('file_id', fileIds);

  if (error) {
    if (isMissingAttachmentLinkTable(error)) return [];
    throw new Error(error.message);
  }

  return [...new Set((data ?? []).map((row: any) => row.file_id).filter(Boolean) as string[])];
}

async function linkedItemKindsByFile(
  client: NonNullable<App.Locals['supabase']>,
  projectId: string,
  fileIds: string[]
) {
  const byFile = new Map<string, ('rfi' | 'submittal')[]>();
  const [rfiFileIds, submittalFileIds] = await Promise.all([
    linkedAttachmentFileIds(client, 'rfi_attachments', projectId, fileIds),
    linkedAttachmentFileIds(client, 'submittal_attachments', projectId, fileIds)
  ]);

  for (const fileId of rfiFileIds) byFile.set(fileId, [...(byFile.get(fileId) ?? []), 'rfi']);
  for (const fileId of submittalFileIds) byFile.set(fileId, [...(byFile.get(fileId) ?? []), 'submittal']);
  return byFile;
}

async function getStorageFallbackFiles(slug: string): Promise<PortalFile[] | null> {
  if (!hasObjectStorageConfig()) return null;

  try {
    const objects = await listProjectObjects(slug);
    if (objects.length === 0) return null;

    const prefix = `projects/${slug}/`;
    return objects.map((object) => {
      const key = object.Key ?? '';
      const relativePath = key.startsWith(prefix) ? key.slice(prefix.length) : key;
      const rawName = relativePath.split('/').pop() || key;
      const name = cleanStorageName(rawName);

      return {
        id: encodeStorageId(key),
        name,
        path: relativePath.replace(rawName, name),
        size: bytesToSize(object.Size),
        type: fileTypeFromName(name),
        updatedAt: object.LastModified?.toISOString() ?? new Date().toISOString(),
        uploadedBy: 'Object storage',
        parentFolderId: null,
        storageKey: key,
        mimeType: null
      };
    });
  } catch {
    return null;
  }
}

async function getStorageFallbackFolders(slug: string): Promise<FolderEntry[] | null> {
  const files = await getStorageFallbackFiles(slug);
  if (!files) return null;

  const counts = new Map<string, number>();
  for (const file of files) {
    const folder = file.path.includes('/') ? file.path.split('/')[0] : 'Root';
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, fileCount]) => ({ name, fileCount, documentKind: null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getFiles(event: EventLike, slug: string): Promise<PortalFile[]> {
  const client = supabase(event);
  if (!client) return (await getStorageFallbackFiles(slug)) ?? mockFiles;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const { data: folderRows } = await client.from('files').select('id, name').eq('project_id', projectId).eq('is_folder', true);
  const folderById = new Map((folderRows ?? []).map((folder: any) => [folder.id, folder.name]));

  const { data, error } = await client
    .from('files')
    .select(
      `id, name, size_bytes, mime_type, updated_at, tags, parent_folder_id, storage_key, uploaded_by,
      document_kind, sheet_number, sheet_title, revision, page_count, ocr_status`
    )
    .eq('project_id', projectId)
    .eq('is_folder', false)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`getFiles failed: ${error.message}`);
  const rows = data ?? [];
  const profiles = await profilesByIds(client, rows.map((row: any) => row.uploaded_by));
  const fileIds = rows.map((row: any) => row.id);
  const [linkedKinds, pagesResult] = await Promise.all([
    linkedItemKindsByFile(client, projectId, fileIds),
    fileIds.length
      ? client
          .from('drawing_pages')
          .select('id, file_id, page_number, name, sheet_number, sheet_title, revision')
          .in('file_id', fileIds)
          .order('page_number', { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ]);
  const { data: pagesData, error: pagesError } = pagesResult;

  if (pagesError) throw new Error(`getFiles pages failed: ${pagesError.message}`);
  const pagesByFile = new Map<string, DrawingPage[]>();
  for (const page of pagesData ?? []) {
    const list = pagesByFile.get(page.file_id) ?? [];
    list.push({
      id: page.id,
      pageNumber: page.page_number,
      name: page.name,
      sheetNumber: page.sheet_number,
      sheetTitle: page.sheet_title,
      revision: page.revision
    });
    pagesByFile.set(page.file_id, list);
  }

  const databaseFiles = rows.map((row: any) => {
    const profile = profiles.get(row.uploaded_by);
    const folder = row.parent_folder_id ? folderById.get(row.parent_folder_id) : null;
    return {
      id: row.id,
      name: row.name,
      path: folder ? `${folder}/${row.name}` : row.name,
      size: bytesToSize(row.size_bytes),
      type: fileTypeFromName(row.name, row.mime_type),
      updatedAt: row.updated_at,
      uploadedBy: profileDisplayName(profile),
      parentFolderId: row.parent_folder_id,
      tags: row.tags ?? undefined,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      documentKind: row.document_kind ?? 'file',
      linkedItemKinds: linkedKinds.get(row.id),
      sheetNumber: row.sheet_number,
      sheetTitle: row.sheet_title,
      revision: row.revision,
      pageCount: row.page_count ?? 1,
      ocrStatus: row.ocr_status ?? 'pending',
      pages: pagesByFile.get(row.id) ?? []
    };
  });

  const storageFiles = (await getStorageFallbackFiles(slug)) ?? [];
  const knownStorageKeys = new Set(databaseFiles.map((file) => file.storageKey).filter(Boolean));
  const storageOnlyFiles = storageFiles.filter((file) => file.storageKey && !knownStorageKeys.has(file.storageKey));

  return [...databaseFiles, ...storageOnlyFiles];
}

export async function getFolders(event: EventLike, slug: string): Promise<FolderEntry[]> {
  const client = supabase(event);
  if (!client) return (await getStorageFallbackFolders(slug)) ?? mockFolders;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const { data: folders, error } = await client
    .from('files')
    .select('id, name, document_kind')
    .eq('project_id', projectId)
    .eq('is_folder', true)
    .order('name');

  if (error) throw new Error(`getFolders failed: ${error.message}`);

  const folderIds = (folders ?? []).map((folder: any) => folder.id);
  const { data: children } = folderIds.length
    ? await client
        .from('files')
        .select('parent_folder_id')
        .eq('project_id', projectId)
        .eq('is_folder', false)
        .in('parent_folder_id', folderIds)
    : { data: [] };

  const counts = new Map<string, number>();
  for (const child of children ?? []) {
    if (!child.parent_folder_id) continue;
    counts.set(child.parent_folder_id, (counts.get(child.parent_folder_id) ?? 0) + 1);
  }

  const merged = new Map<string, FolderEntry>();
  for (const folder of folders ?? []) {
    merged.set(folder.name, {
      id: folder.id,
      name: folder.name,
      fileCount: counts.get(folder.id) ?? 0,
      documentKind: folder.document_kind ?? null
    });
  }
  for (const folder of (await getStorageFallbackFolders(slug)) ?? []) {
    const existing = merged.get(folder.name);
    merged.set(folder.name, {
      id: existing?.id,
      name: folder.name,
      fileCount: (existing?.fileCount ?? 0) + folder.fileCount,
      documentKind: existing?.documentKind ?? folder.documentKind ?? null
    });
  }

  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUpdates(event: EventLike, slug: string): Promise<Update[]> {
  const client = supabase(event);
  if (!client) return mockUpdates;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];
  const viewerId = await currentUserId(event);

  const { data, error } = await client
    .from('updates')
    .select('id, kind, title, body, attachments_json, created_at, author_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getUpdates failed: ${error.message}`);
  const rows = data ?? [];
  const updateIds = rows.map((row: any) => row.id);
  const [{ data: commentRows, error: commentsError }, { data: likeRows, error: likesError }] = updateIds.length
    ? await Promise.all([
        client
          .from('update_comments')
          .select('id, update_id, author_id, body, created_at')
          .in('update_id', updateIds)
          .order('created_at', { ascending: true }),
        client.from('update_likes').select('update_id, user_id').in('update_id', updateIds)
      ])
    : [
        { data: [], error: null },
        { data: [], error: null }
      ];

  if (commentsError && commentsError.code !== '42P01') throw new Error(`getUpdates comments failed: ${commentsError.message}`);
  if (likesError && likesError.code !== '42P01') throw new Error(`getUpdates likes failed: ${likesError.message}`);

  const profileIds = [
    ...rows.map((row: any) => row.author_id),
    ...((commentRows ?? []) as any[]).map((comment) => comment.author_id)
  ];
  const profiles = await profilesByIds(client, profileIds);
  const commentsByUpdate = new Map<string, { id: string; author: string; body: string; createdAt: string }[]>();
  for (const comment of (commentRows ?? []) as any[]) {
    const list = commentsByUpdate.get(comment.update_id) ?? [];
    list.push({
      id: comment.id,
      author: profileDisplayName(profiles.get(comment.author_id), 'Project member'),
      body: comment.body ?? '',
      createdAt: comment.created_at
    });
    commentsByUpdate.set(comment.update_id, list);
  }
  const likesByUpdate = new Map<string, { count: number; likedByMe: boolean }>();
  for (const like of (likeRows ?? []) as any[]) {
    const current = likesByUpdate.get(like.update_id) ?? { count: 0, likedByMe: false };
    current.count += 1;
    if (viewerId && like.user_id === viewerId) current.likedByMe = true;
    likesByUpdate.set(like.update_id, current);
  }

  return rows.map((row: any) => {
    const author = profiles.get(row.author_id);
    const posted = new Date(row.created_at);
    const comments = commentsByUpdate.get(row.id) ?? [];
    const likes = likesByUpdate.get(row.id) ?? { count: 0, likedByMe: false };
    return {
      id: row.id,
      type:
        row.kind === 'oac_recap'
          ? 'OAC Recap'
          : row.kind === 'phase_kickoff'
            ? 'Phase Kickoff'
            : row.kind === 'safety'
              ? 'Safety'
              : row.kind === 'weekly'
                ? 'Weekly'
                : 'General',
      title: row.title,
      body: row.body ?? '',
      author: profileDisplayName(author, 'Pueblo Electric'),
      postedDate: posted.toISOString(),
      postedTime: relativeTime(row.created_at),
      likes: likes.count,
      likedByMe: likes.likedByMe,
      commentCount: comments.length,
      comments,
      attachments: normalizeUpdateAttachments(row.attachments_json)
    };
  });
}

export async function getDirectory(event: EventLike, slug: string): Promise<DirectoryEntry[]> {
  const client = supabase(event);
  if (!client) return mockDirectory;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const [{ data, error }, { data: contacts, error: contactsError }] = await Promise.all([
    client
    .from('project_members')
    .select('id, user_id, role')
      .eq('project_id', projectId),
    client
      .from('project_contacts')
      .select('id, name, role, organization, email, phone, contact_type')
      .eq('project_id', projectId)
      .order('name')
  ]);

  if (error) throw new Error(`getDirectory failed: ${error.message}`);
  if (contactsError && contactsError.code !== '42P01') throw new Error(`getDirectory contacts failed: ${contactsError.message}`);
  const rows = data ?? [];
  const profiles = await profilesByIds(client, rows.map((row: any) => row.user_id));

  const portalEntries: DirectoryEntry[] = rows.map((row: any) => {
    const profile = profiles.get(row.user_id);
    const roleLabel: DirectoryEntry['status'] =
      row.role === 'readonly' ? 'Reviewer' : row.role === 'admin' ? 'Admin' : row.role === 'guest' ? 'Guest' : 'Member';
    return {
      id: profile?.id ?? row.user_id ?? row.id,
      name: profileDisplayName(profile, 'Project member'),
      role: profile?.title ?? roleLabel,
      organization: profile?.company ?? 'Pueblo Electric',
      email: profile?.email ?? undefined,
      phone: null,
      contactType: 'portal' as const,
      status: roleLabel
    };
  });
  const contactEntries: DirectoryEntry[] = ((contacts ?? []) as any[]).map((contact) => ({
    id: contact.id,
    name: contact.name,
    role: contact.role ?? 'Project contact',
    organization: contact.organization ?? '',
    email: contact.email ?? undefined,
    phone: contact.phone ?? null,
    contactType: 'external' as const,
    status:
      contact.contact_type === 'owner'
        ? 'Owner'
        : contact.contact_type === 'ahj'
          ? 'AHJ'
          : contact.contact_type === 'reviewer'
            ? 'Reviewer'
            : 'Guest'
  }));

  return [...portalEntries, ...contactEntries].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getChatSubjects(event: EventLike, slug: string): Promise<ChatSubject[]> {
  const client = supabase(event);
  if (!client) return mockChatSubjects;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];
  const viewerId = await currentUserId(event);

  const { data, error } = await client
    .from('chat_subjects')
    .select('id, title, last_message_at, chat_messages (id, body, attachments_json, created_at, author_id)')
    .eq('project_id', projectId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw new Error(`getChatSubjects failed: ${error.message}`);

  const profileIds = (data ?? []).flatMap((row: any) =>
    (row.chat_messages ?? []).map((message: any) => message.author_id)
  );
  const profiles = await profilesByIds(client, profileIds);
  const subjectIds = (data ?? []).map((row: any) => row.id);
  const { data: readRows, error: readsError } =
    viewerId && subjectIds.length
      ? await client.from('chat_message_reads').select('subject_id, last_read_at').eq('user_id', viewerId).in('subject_id', subjectIds)
      : { data: [], error: null };
  if (readsError && readsError.code !== '42P01') throw new Error(`getChatSubjects read state failed: ${readsError.message}`);
  const readAtBySubject = new Map(((readRows ?? []) as any[]).map((row) => [row.subject_id, row.last_read_at]));

  return (data ?? []).map((row: any) => {
    const messages = [...(row.chat_messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const participants = new Set<string>();
    const mappedMessages = messages.map((msg: any) => {
      const profile = profiles.get(msg.author_id);
      const author = profileDisplayName(profile, 'Project member');
      participants.add(author);
      return {
        id: msg.id,
        author,
        role: profile?.company ?? 'Project team',
        body: msg.body,
        timestamp: msg.created_at,
        attachments: normalizeItemAttachments(msg.attachments_json)
      };
    });
    const lastReadAt = readAtBySubject.get(row.id);
    const unreadCount =
      viewerId && lastReadAt ? messages.filter((message: any) => message.author_id !== viewerId && message.created_at > lastReadAt).length : 0;

    return {
      id: row.id,
      name: row.title,
      description: messages.at(-1)?.body ?? 'Project conversation',
      messageCount: messages.length,
      unreadCount,
      participants: [...participants],
      messages: mappedMessages
    };
  });
}

export type AdminProjectRow = {
  id: string;
  slug: string;
  name: string;
  customer: string;
  address: string | null;
  phase: string;
  percentComplete: number;
  memberCount: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string | null;
  company: string | null;
  title: string | null;
  isSuperadmin: boolean;
  projectCount: number;
  emailConfirmed: boolean;
  projects: {
    id: string;
    slug: string;
    name: string;
    role: string;
    isSubmittalManager: boolean;
    isRfiManager: boolean;
  }[];
};

export type AdminAuditRow = {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
};

export async function listAdminProjects(): Promise<AdminProjectRow[]> {
  if (!hasSupabaseAdminConfig() && !isProductionRuntime()) {
    return mockProjects.map((project) => ({
      id: project.id,
      slug: project.id,
      name: project.title,
      customer: project.owner,
      address: project.address,
      phase: Object.entries(phaseToStatus).find(([, label]) => label === project.status)?.[0] ?? 'pre_con',
      percentComplete: project.completionPercent,
      memberCount: mockDirectory.length
    }));
  }

  const admin = createAdminClient();
  const [projects, members] = await Promise.all([
    admin.from('projects').select('id, slug, name, customer, address, phase, percent_complete').order('created_at', { ascending: false }),
    admin.from('project_members').select('project_id')
  ]);

  if (projects.error) throw new Error(projects.error.message);
  if (members.error) throw new Error(members.error.message);

  const counts = new Map<string, number>();
  for (const member of members.data ?? []) counts.set(member.project_id, (counts.get(member.project_id) ?? 0) + 1);

  return (projects.data ?? []).map((project: any) => ({
    id: project.id,
    slug: project.slug,
    name: project.name,
    customer: project.customer,
    address: project.address,
    phase: project.phase,
    percentComplete: project.percent_complete ?? 0,
    memberCount: counts.get(project.id) ?? 0
  }));
}

async function listProjectMembersForAdmin(admin: ReturnType<typeof createAdminClient>) {
  const members = await admin
    .from('project_members')
    .select('user_id, role, is_submittal_manager, is_rfi_manager, projects:project_id (id, slug, name)');

  if (!members.error) return members.data ?? [];
  if (!isMissingProjectMemberManagerFlagError(members.error)) throw new Error(members.error.message);

  const fallback = await admin
    .from('project_members')
    .select('user_id, role, projects:project_id (id, slug, name)');
  if (fallback.error) throw new Error(fallback.error.message);

  return (fallback.data ?? []).map((member: any) => ({
    ...member,
    is_submittal_manager: false,
    is_rfi_manager: false
  }));
}

export async function adminProjectMemberManagerFlagsAvailable() {
  if (!hasSupabaseAdminConfig() && !isProductionRuntime()) return true;
  return projectMemberManagerFlagsAvailable(createAdminClient());
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  if (!hasSupabaseAdminConfig() && !isProductionRuntime()) {
    return [
      {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'mock.portal.user@puebloelectrics.local',
        fullName: 'Local Portal User',
        company: 'Pueblo Electric',
        title: 'Mock Admin',
        isSuperadmin: true,
        projectCount: mockProjects.length,
        emailConfirmed: true,
        projects: mockProjects.map((project) => ({
          id: project.id,
          slug: project.id,
          name: project.title,
          role: 'admin',
          isSubmittalManager: true,
          isRfiManager: true
        }))
      }
    ];
  }

  const admin = createAdminClient();
  const [users, profiles, members] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('profiles').select('id, full_name, company, title, is_superadmin'),
    listProjectMembersForAdmin(admin)
  ]);

  if (users.error) throw new Error(users.error.message);
  if (profiles.error) throw new Error(profiles.error.message);

  const profileById = new Map((profiles.data ?? []).map((profile: any) => [profile.id, profile]));
  const projectsByUser = new Map<string, AdminUserRow['projects']>();
  for (const member of members ?? []) {
    const project = first(member.projects);
    if (!project) continue;
    const projects = projectsByUser.get(member.user_id) ?? [];
    projects.push({
      id: project.id,
      slug: project.slug,
      name: project.name,
      role: member.role,
      isSubmittalManager: Boolean(member.is_submittal_manager),
      isRfiManager: Boolean(member.is_rfi_manager)
    });
    projectsByUser.set(member.user_id, projects);
  }

  return users.data.users
    .map((user) => {
      const profile: any = profileById.get(user.id);
      const projects = (projectsByUser.get(user.id) ?? []).sort((a, b) => a.slug.localeCompare(b.slug));
      return {
        id: user.id,
        email: user.email ?? '',
        fullName: profile?.full_name ?? null,
        company: profile?.company ?? null,
        title: profile?.title ?? null,
        isSuperadmin: Boolean(profile?.is_superadmin),
        projectCount: projects.length,
        emailConfirmed: Boolean(user.email_confirmed_at),
        projects
      };
    })
    .sort((a, b) => Number(b.isSuperadmin) - Number(a.isSuperadmin) || a.email.localeCompare(b.email));
}

export async function listAdminAuditLogs(limit = 25): Promise<AdminAuditRow[]> {
  if (!hasSupabaseAdminConfig() && !isProductionRuntime()) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('admin_audit_log')
    .select('id, created_at, actor_email, action, target_type, target_id, details')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    createdAt: row.created_at,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details ?? {}
  }));
}
