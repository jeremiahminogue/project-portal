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
} from '../../../data/types';
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
} from '../../../data';
import { bytesToSize, relativeTime } from '$lib/utils';
import { encodeStorageId, hasObjectStorageConfig, listProjectObjects } from './object-storage';
import { createAdminClient } from './supabase-admin';

type EventLike = Pick<RequestEvent, 'locals'>;

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  company: string | null;
  title: string | null;
};

export type PortalFile = FileEntry & {
  storageKey?: string | null;
  mimeType?: string | null;
  documentKind?: 'drawing' | 'specification' | 'file';
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
  notes?: string | null;
};

export type PortalRfi = RFI & {
  id?: string;
  title?: string;
  answer?: string | null;
};

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

function rowToProject(row: any, stats?: { submittals?: number; rfis?: number; actions?: number; activity?: string }) {
  return {
    id: row.slug,
    number: `#${row.slug}`,
    title: row.name,
    address: row.address ?? '',
    owner: row.customer,
    status: phaseToStatus[row.phase] ?? 'Pre-Con',
    completionPercent: row.percent_complete ?? 0,
    targetComplete: '',
    nextMilestone: row.next_milestone ?? '',
    nextMilestoneDate: row.next_milestone_date ?? '',
    openSubmittals: stats?.submittals ?? 0,
    openRfis: stats?.rfis ?? 0,
    actionItems: stats?.actions ?? 0,
    lastActivity: stats?.activity ?? '',
    lastActivityTime: row.updated_at ? relativeTime(row.updated_at) : '',
    lastActivityAuthor: 'PE'
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
  return data ? rowToProject(data) : null;
}

export async function getSchedule(event: EventLike, slug: string): Promise<ScheduleActivity[]> {
  const client = supabase(event);
  if (!client) return mockSchedule;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const { data, error } = await client
    .from('schedule_activities')
    .select('id, phase, title, start_date, end_date, owner, status, is_blackout')
    .eq('project_id', projectId)
    .order('start_date', { ascending: true });

  if (error) throw new Error(`getSchedule failed: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    phase: row.phase,
    title: row.title,
    type: 'internal',
    startDate: row.start_date,
    endDate: row.end_date,
    owner: row.owner ?? '',
    status: row.status as StatusChip,
    isBlackout: Boolean(row.is_blackout)
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
      owner,
      submittal_routing_steps (step_order, role, assignee)`
    )
    .eq('project_id', projectId)
    .order('submitted_date', { ascending: false });

  if (error) throw new Error(`getSubmittals failed: ${error.message}`);
  const rows = data ?? [];
  const profileIds = rows.flatMap((row: any) => [
    row.owner,
    ...(row.submittal_routing_steps ?? []).map((step: any) => step.assignee)
  ]);
  const profiles = await profilesByIds(client, profileIds);

  return rows.map((row: any) => {
    const owner = profiles.get(row.owner);
    const steps = [...(row.submittal_routing_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      specSection: row.spec_section ?? '',
      submittedDate: row.submitted_date ?? '',
      dueDate: row.due_date ?? '',
      owner: profileDisplayName(owner),
      status: submittalStatusLabel[row.status] ?? 'Draft',
      currentStep: row.current_step ?? 0,
      notes: row.notes,
      routing: steps.map((step: any) => {
        const profile = profiles.get(step.assignee);
        return profile?.company ?? profile?.full_name ?? step.role ?? 'Reviewer';
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
    .select('id, number, title, question, opened_date, due_date, assigned_to, assigned_org, status, answer')
    .eq('project_id', projectId)
    .order('opened_date', { ascending: false });

  if (error) throw new Error(`getRfis failed: ${error.message}`);
  const rows = data ?? [];
  const profiles = await profilesByIds(client, rows.map((row: any) => row.assigned_to));

  return rows.map((row: any) => {
    const assigned = profiles.get(row.assigned_to);
    return {
      id: row.id,
      number: row.number,
      title: row.title,
      question: row.question ?? '',
      openedDate: row.opened_date ?? '',
      dueDate: row.due_date ?? '',
      assignedTo: profileDisplayName(assigned),
      assignedOrg: row.assigned_org ?? '',
      status: rfiStatusLabel[row.status] ?? 'Open',
      answer: row.answer
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
    .map(([name, fileCount]) => ({ name, fileCount }))
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
  const { data: pagesData, error: pagesError } = fileIds.length
    ? await client
        .from('drawing_pages')
        .select('id, file_id, page_number, name, sheet_number, sheet_title, revision')
        .in('file_id', fileIds)
        .order('page_number', { ascending: true })
    : { data: [], error: null };

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
      tags: row.tags ?? undefined,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      documentKind: row.document_kind ?? 'file',
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
    .select('id, name')
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

  const merged = new Map<string, number>();
  for (const folder of folders ?? []) merged.set(folder.name, counts.get(folder.id) ?? 0);
  for (const folder of (await getStorageFallbackFolders(slug)) ?? []) {
    merged.set(folder.name, (merged.get(folder.name) ?? 0) + folder.fileCount);
  }

  return [...merged.entries()].map(([name, fileCount]) => ({ name, fileCount })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUpdates(event: EventLike, slug: string): Promise<Update[]> {
  const client = supabase(event);
  if (!client) return mockUpdates;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const { data, error } = await client
    .from('updates')
    .select('id, kind, title, body, created_at, author_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getUpdates failed: ${error.message}`);
  const rows = data ?? [];
  const profiles = await profilesByIds(client, rows.map((row: any) => row.author_id));

  return rows.map((row: any) => {
    const author = profiles.get(row.author_id);
    const posted = new Date(row.created_at);
    return {
      id: row.id,
      type: row.kind === 'phase_kickoff' ? 'Phase Kickoff' : row.kind === 'safety' ? 'Safety' : row.kind === 'weekly' ? 'Weekly' : 'OAC Recap',
      title: row.title,
      body: row.body ?? '',
      author: profileDisplayName(author, 'Pueblo Electric'),
      postedDate: posted.toISOString(),
      postedTime: relativeTime(row.created_at),
      likes: 0,
      commentCount: 0
    };
  });
}

export async function getDirectory(event: EventLike, slug: string): Promise<DirectoryEntry[]> {
  const client = supabase(event);
  if (!client) return mockDirectory;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const { data, error } = await client
    .from('project_members')
    .select('id, user_id, role')
    .eq('project_id', projectId);

  if (error) throw new Error(`getDirectory failed: ${error.message}`);
  const rows = data ?? [];
  const profiles = await profilesByIds(client, rows.map((row: any) => row.user_id));

  return rows.map((row: any) => {
    const profile = profiles.get(row.user_id);
    const roleLabel = row.role === 'readonly' ? 'Reviewer' : row.role === 'admin' ? 'Admin' : row.role === 'guest' ? 'Guest' : 'Member';
    return {
      id: profile?.id ?? row.user_id ?? row.id,
      name: profileDisplayName(profile, 'Project member'),
      role: profile?.title ?? roleLabel,
      organization: profile?.company ?? 'Pueblo Electric',
      email: profile?.email ?? undefined,
      status: roleLabel
    };
  });
}

export async function getChatSubjects(event: EventLike, slug: string): Promise<ChatSubject[]> {
  const client = supabase(event);
  if (!client) return mockChatSubjects;
  const projectId = await getProjectId(event, slug);
  if (!projectId) return [];

  const { data, error } = await client
    .from('chat_subjects')
    .select('id, title, last_message_at, chat_messages (id, body, created_at, author_id)')
    .eq('project_id', projectId)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw new Error(`getChatSubjects failed: ${error.message}`);

  const profileIds = (data ?? []).flatMap((row: any) =>
    (row.chat_messages ?? []).map((message: any) => message.author_id)
  );
  const profiles = await profilesByIds(client, profileIds);

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
        timestamp: msg.created_at
      };
    });

    return {
      id: row.id,
      name: row.title,
      description: messages.at(-1)?.body ?? 'Project conversation',
      messageCount: messages.length,
      unreadCount: 0,
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
  }[];
};

export async function listAdminProjects(): Promise<AdminProjectRow[]> {
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

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const admin = createAdminClient();
  const [users, profiles, members] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from('profiles').select('id, full_name, company, title, is_superadmin'),
    admin.from('project_members').select('user_id, role, projects:project_id (id, slug, name)')
  ]);

  if (users.error) throw new Error(users.error.message);
  if (profiles.error) throw new Error(profiles.error.message);
  if (members.error) throw new Error(members.error.message);

  const profileById = new Map((profiles.data ?? []).map((profile: any) => [profile.id, profile]));
  const projectsByUser = new Map<string, AdminUserRow['projects']>();
  for (const member of members.data ?? []) {
    const project = first(member.projects);
    if (!project) continue;
    const projects = projectsByUser.get(member.user_id) ?? [];
    projects.push({
      id: project.id,
      slug: project.slug,
      name: project.name,
      role: member.role
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
