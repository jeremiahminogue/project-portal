<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    Check,
    ChevronDown,
    ChevronRight,
    Copy,
    Download,
    FileText,
    FolderPlus,
    Link,
    MoveRight,
    Pencil,
    RefreshCw,
    Search,
    Trash2,
    X
  } from '@lucide/svelte';
  import FileUploadButton from '$lib/components/FileUploadButton.svelte';
  import { uploadProjectFile } from '$lib/client/project-file-upload';
  import PageShell from '$lib/components/PageShell.svelte';
  import {
    fileMatchesTool,
    folderName as libraryFolderName,
    isDrawingFile,
    isGeneralDocumentFile,
    isSpecificationFile
  } from '$lib/file-library';
  import { formatDate } from '$lib/utils';

  let { data } = $props();
  let query = $state('');
  let collapsedGroups = $state<string[]>([]);
  let renameGroupId = $state('');
  let renameGroupName = $state('');
  let renameGroupOriginalName = $state('');
  let renameId = $state('');
  let renameName = $state('');
  let renameFileNumber = $state('');
  let renameFileTitle = $state('');
  let renamePageId = $state('');
  let renamePageSheetNumber = $state('');
  let renamePageSheetTitle = $state('');
  let busy = $state(false);
  let notice = $state('');
  let selectedPageIds = $state<string[]>([]);
  let selectedFileIds = $state<string[]>([]);
  let dropGroupId = $state('');
  let orderDropFileId = $state('');
  let draggingFileIds = $state<string[]>([]);
  const GENERAL_FOLDER_VALUE = '__general__';
  const INTERNAL_FILE_DRAG_TYPE = 'application/x-project-portal-file-ids';
  let showNewFolderForm = $state(false);
  let newFolderName = $state('');
  let moveTargetFolderId = $state(GENERAL_FOLDER_VALUE);

  type FileRow = (typeof data.files)[number];
  type PageRow = NonNullable<FileRow['pages']>[number];
  type FileGroup = {
    name: string;
    folderId: string;
    files: FileRow[];
    count: number;
  };

  const documentTool = $derived(
    $page.url.searchParams.get('tool') === 'specifications'
      ? 'specifications'
      : $page.url.searchParams.get('tool') === 'documents'
        ? 'documents'
        : 'drawings'
  );
  const toolTitle = $derived(documentTool === 'specifications' ? 'Specifications' : documentTool === 'documents' ? 'Documents' : 'Drawings');
  const canModifyFiles = $derived(Boolean(data.fileAccess?.canModify));
  const canUploadFiles = $derived(Boolean(data.fileAccess?.canUpload));
  const canDeleteFiles = $derived(Boolean(data.fileAccess?.canDelete));
  const canReindexFiles = $derived(Boolean(data.fileAccess?.canReindex));
  const folderOrganizationEnabled = $derived(documentTool === 'drawings' || documentTool === 'documents');
  const uploadDocumentKind = $derived(documentTool === 'specifications' ? 'specification' : documentTool === 'documents' ? 'file' : 'drawing');
  const defaultUploadFolder = $derived(documentTool === 'specifications' ? 'Specifications' : '');
  const uploadFolder = $derived(defaultUploadFolder);
  const uploadFolderEditable = $derived(documentTool === 'drawings' || documentTool === 'documents');
  const uploadFolderLabel = $derived(documentTool === 'documents' ? 'Document folder' : 'Drawing group');
  const uploadFolderPlaceholder = $derived(documentTool === 'documents' ? 'New document folder' : 'General, Civil, Electrical...');

  const toolFiles = $derived(data.files.filter((file) => fileMatchesTool(file, documentTool)));
  const toolFolders = $derived(
    data.folders
      .filter((folder) => folder.name !== 'General' && folderMatchesCurrentTool(folder))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
  const toolFolderNames = $derived(
    uniqueFolderOptions([...toolFiles.map((file) => folderName(file)).filter((name) => name !== 'General'), ...toolFolders.map((folder) => folder.name)])
  );
  const uploadFolderOptions = $derived(
    documentTool === 'documents'
      ? toolFolderNames
      : documentTool === 'drawings'
        ? toolFolderNames
        : []
  );
  const filteredFiles = $derived(
    toolFiles.filter((file) => {
      return !query || `${file.name} ${file.path} ${file.tags?.join(' ') ?? ''}`.toLowerCase().includes(query.toLowerCase());
    })
  );
  const folderRowsByName = $derived(new Map(data.folders.map((folder) => [folder.name.toLowerCase(), folder])));
  const groupedFiles = $derived(
    uniqueFolderOptions([
      ...filteredFiles.map((file) => folderName(file)),
      ...toolFolders
        .filter((folder) => !query || folder.name.toLowerCase().includes(query.toLowerCase()))
        .map((folder) => folder.name)
    ])
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const files = filteredFiles.filter((file) => folderName(file) === name);
        const folderRow = folderRowsByName.get(name.toLowerCase());
        return {
          name,
          folderId: folderRow?.id ?? files.find((file) => file.parentFolderId)?.parentFolderId ?? '',
          files,
          count: documentTool === 'drawings' ? files.reduce((total, file) => total + drawingSheetCount(file), 0) : files.length
        };
      })
  );
  const visibleDrawingPages = $derived(
    documentTool === 'drawings'
      ? filteredFiles.flatMap((file) => (file.pages ?? []).map((page) => ({ file, page })))
      : []
  );
  const selectedVisiblePageCount = $derived(visibleDrawingPages.filter(({ page }) => selectedPageIds.includes(page.id)).length);
  const selectedVisibleFileIds = $derived(
    documentTool === 'drawings'
      ? selectedFileIds.filter((id) => filteredFiles.some((file) => file.id === id && !(file.pages?.length) && !fileIsStorageOnly(file)))
      : []
  );
  const selectedDrawingFileIds = $derived(
    [
      ...new Set([
        ...visibleDrawingPages.filter(({ file, page }) => !fileIsStorageOnly(file) && selectedPageIds.includes(page.id)).map(({ file }) => file.id),
        ...selectedVisibleFileIds
      ])
    ]
  );
  const visibleDocumentFiles = $derived(documentTool === 'documents' ? filteredFiles.filter((file) => !fileIsStorageOnly(file)) : []);
  const selectedDocumentFileIds = $derived(
    documentTool === 'documents' ? selectedFileIds.filter((id) => visibleDocumentFiles.some((file) => file.id === id)) : []
  );
  const selectedMovableFileIds = $derived(documentTool === 'drawings' ? selectedDrawingFileIds : selectedDocumentFileIds);
  const allVisiblePagesSelected = $derived(
    visibleDrawingPages.length > 0 && visibleDrawingPages.every(({ page }) => selectedPageIds.includes(page.id))
  );
  const allVisibleDocumentsSelected = $derived(
    visibleDocumentFiles.length > 0 && visibleDocumentFiles.every((file) => selectedFileIds.includes(file.id))
  );
  const moveFolderOptions = $derived(toolFolders.filter(hasFolderId));

  function isSpecification(file: (typeof data.files)[number]) {
    return isSpecificationFile(file);
  }

  function uniqueFolderOptions(names: string[]) {
    return [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function hasFolderId(folder: (typeof data.folders)[number]): folder is (typeof data.folders)[number] & { id: string } {
    return typeof folder.id === 'string' && folder.id.length > 0;
  }

  function folderName(file: (typeof data.files)[number]) {
    return libraryFolderName(file);
  }

  function folderMatchesCurrentTool(folder: (typeof data.folders)[number]) {
    const folderKey = folder.name.toLowerCase();
    if (toolFiles.some((file) => folderName(file).toLowerCase() === folderKey)) return true;
    return folder.documentKind === uploadDocumentKind && folder.fileCount === 0;
  }

  function drawingSheetCount(file: FileRow) {
    return Math.max(file.pages?.length ?? 0, 1);
  }

  function isGeneralDocument(file: (typeof data.files)[number]) {
    return isGeneralDocumentFile(file);
  }

  function isDrawing(file: (typeof data.files)[number]) {
    return isDrawingFile(file);
  }

  function documentNumber(file: (typeof data.files)[number]) {
    if (file.sheetNumber) return file.sheetNumber;
    const base = file.name.replace(/\.[^.]+$/, '');
    const match = base.match(/^[A-Z]{0,4}[-_ ]?\d+(?:\.\d+)?[A-Z]?/i);
    return (match?.[0] ?? base.split(/[\s_]+/)[0] ?? base).replaceAll('_', '-');
  }

  function documentTitle(file: (typeof data.files)[number]) {
    if (file.sheetTitle) return file.sheetTitle;
    return file.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ');
  }

  function revisionFor(file: (typeof data.files)[number]) {
    if (file.revision) return file.revision;
    const tag = file.tags?.find((value) => /^rev(?:ision)?[:\s-]/i.test(value));
    if (tag) return tag.replace(/^rev(?:ision)?[:\s-]*/i, '').trim() || '0';
    const match = file.name.match(/\b(?:rev(?:ision)?|r)[\s._-]*([A-Z0-9]+)\b/i);
    return match?.[1] ?? '0';
  }

  function fileHasStorage(file: (typeof data.files)[number]) {
    return Boolean(file.storageKey || file.id.startsWith('storage:'));
  }

  function fileIsStorageOnly(file: (typeof data.files)[number]) {
    return file.id.startsWith('storage:');
  }

  function fileIsPdf(file: (typeof data.files)[number]) {
    return /pdf/i.test(file.mimeType ?? '') || /\.pdf$/i.test(file.name);
  }

  function fileCanRunOcr(file: (typeof data.files)[number]) {
    return fileHasStorage(file) && fileIsPdf(file) && !fileIsStorageOnly(file);
  }

  function groupOcrFiles(group: FileGroup) {
    return group.files.filter(fileCanRunOcr);
  }

  function fileEndpoint(id: string) {
    return `/api/files/${encodeURIComponent(id)}`;
  }

  function viewerHref(id: string, pageNumber = 1) {
    const params = pageNumber > 1 ? `?page=${pageNumber}` : '';
    return `/projects/${data.project.id}/files/${encodeURIComponent(id)}${params}`;
  }

  function pageEndpoint(fileId: string, pageId: string) {
    return `/api/files/${encodeURIComponent(fileId)}/pages/${encodeURIComponent(pageId)}`;
  }

  function reindexEndpoint(fileId: string) {
    return `/api/files/${encodeURIComponent(fileId)}/reindex`;
  }

  function reindexDocumentKind() {
    return documentTool === 'specifications' ? 'specification' : documentTool === 'documents' ? 'file' : 'drawing';
  }

  function filePageIds(file: (typeof data.files)[number]) {
    return (file.pages ?? []).map((page) => page.id);
  }

  function pageSelected(pageId: string) {
    return selectedPageIds.includes(pageId);
  }

  function fileSelected(fileId: string) {
    return selectedFileIds.includes(fileId);
  }

  function filePagesSelected(file: (typeof data.files)[number]) {
    const ids = filePageIds(file);
    return ids.length > 0 && ids.every((id) => selectedPageIds.includes(id));
  }

  function togglePage(pageId: string, checked: boolean) {
    selectedPageIds = checked
      ? [...new Set([...selectedPageIds, pageId])]
      : selectedPageIds.filter((id) => id !== pageId);
  }

  function toggleFilePages(file: (typeof data.files)[number], checked: boolean) {
    const ids = filePageIds(file);
    selectedPageIds = checked
      ? [...new Set([...selectedPageIds, ...ids])]
      : selectedPageIds.filter((id) => !ids.includes(id));
  }

  function toggleVisiblePages(checked: boolean) {
    const ids = visibleDrawingPages.map(({ page }) => page.id);
    selectedPageIds = checked
      ? [...new Set([...selectedPageIds, ...ids])]
      : selectedPageIds.filter((id) => !ids.includes(id));
  }

  function toggleVisibleDocuments(checked: boolean) {
    const ids = visibleDocumentFiles.map((file) => file.id);
    selectedFileIds = checked
      ? [...new Set([...selectedFileIds, ...ids])]
      : selectedFileIds.filter((id) => !ids.includes(id));
  }

  function groupIsCollapsed(name: string) {
    return collapsedGroups.includes(name);
  }

  function toggleGroupCollapsed(name: string) {
    collapsedGroups = groupIsCollapsed(name) ? collapsedGroups.filter((value) => value !== name) : [...collapsedGroups, name];
  }

  function groupPageIds(group: FileGroup) {
    return group.files.flatMap((file) => filePageIds(file));
  }

  function groupRenameKey(group: FileGroup) {
    return group.folderId || `virtual:${group.name}`;
  }

  function groupCanRename(group: FileGroup) {
    return Boolean(group.folderId || group.files.some((file) => !fileIsStorageOnly(file)));
  }

  function toggleFileSelection(fileId: string, checked: boolean) {
    selectedFileIds = checked
      ? [...new Set([...selectedFileIds, fileId])]
      : selectedFileIds.filter((id) => id !== fileId);
  }

  function groupCanReceiveDrops(group: FileGroup) {
    return (canUploadFiles || (canModifyFiles && folderOrganizationEnabled)) && !busy && renameGroupId !== groupRenameKey(group);
  }

  function groupUploadFolderName(group: FileGroup) {
    return group.name === 'General' && !group.folderId ? '' : group.name;
  }

  function hasDraggedFiles(event: DragEvent) {
    const transfer = event.dataTransfer;
    if (!transfer) return false;
    if (transfer.items?.length) return Array.from(transfer.items).some((item) => item.kind === 'file');
    return transfer.files.length > 0;
  }

  function hasInternalFileDrag(event: DragEvent) {
    const transfer = event.dataTransfer;
    if (!transfer) return draggingFileIds.length > 0;
    return Array.from(transfer.types ?? []).includes(INTERNAL_FILE_DRAG_TYPE) || draggingFileIds.length > 0;
  }

  function draggedFileIds(event: DragEvent) {
    const raw = event.dataTransfer?.getData(INTERNAL_FILE_DRAG_TYPE);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
      } catch {
        return draggingFileIds;
      }
    }
    return draggingFileIds;
  }

  function movableFileIds(ids: string[]) {
    const visibleIds = new Set(filteredFiles.filter((file) => !fileIsStorageOnly(file)).map((file) => file.id));
    return [...new Set(ids)].filter((id) => visibleIds.has(id));
  }

  function dragIdsForFile(file: FileRow) {
    const selectedIds = selectedMovableFileIds.includes(file.id) ? selectedMovableFileIds : [file.id];
    return movableFileIds(selectedIds);
  }

  function startFileDrag(event: DragEvent, file: FileRow) {
    if (!folderOrganizationEnabled || !canModifyFiles || fileIsStorageOnly(file)) return;
    const ids = dragIdsForFile(file);
    if (!ids.length || !event.dataTransfer) return;
    draggingFileIds = ids;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(INTERNAL_FILE_DRAG_TYPE, JSON.stringify(ids));
    event.dataTransfer.setData('text/plain', ids.join(','));
  }

  function endFileDrag() {
    draggingFileIds = [];
    dropGroupId = '';
    orderDropFileId = '';
  }

  function folderPayloadForGroup(group: FileGroup) {
    if (group.folderId) return { folderId: group.folderId };
    if (group.name === 'General') return { folderId: null };
    return { folderName: group.name };
  }

  function orderedFileIdsForDrop(group: FileGroup, movingIds: string[], beforeFileId = '') {
    const ids = movableFileIds(movingIds);
    const currentIds = group.files
      .filter((file) => !fileIsStorageOnly(file))
      .map((file) => file.id)
      .filter((id) => !ids.includes(id));
    const insertAt = beforeFileId && !ids.includes(beforeFileId) ? currentIds.indexOf(beforeFileId) : -1;
    if (insertAt >= 0) {
      currentIds.splice(insertAt, 0, ...ids);
      return currentIds;
    }
    return [...currentIds, ...ids];
  }

  function groupForFile(file: FileRow) {
    return groupedFiles.find((group) => group.files.some((candidate) => candidate.id === file.id));
  }

  async function reorderFilesInGroup(fileIds: string[], group: FileGroup, orderedFileIds?: string[]) {
    const ids = movableFileIds(fileIds);
    if (!ids.length) return;
    busy = true;
    notice = '';
    try {
      const response = await fetch('/api/files/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectSlug: data.project.id,
          fileIds: ids,
          orderedFileIds,
          documentKind: uploadDocumentKind,
          ...folderPayloadForGroup(group)
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Files could not be organized.');
      const moved = result.moved ?? ids.length;
      notice = orderedFileIds?.length
        ? `Updated ${group.name} order.`
        : `Moved ${moved} file${moved === 1 ? '' : 's'} to ${group.name}.`;
      selectedPageIds = [];
      selectedFileIds = [];
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Files could not be organized.';
    } finally {
      busy = false;
      endFileDrag();
    }
  }

  function markGroupDrop(event: DragEvent, group: FileGroup) {
    if (!groupCanReceiveDrops(group)) return;
    if (folderOrganizationEnabled && canModifyFiles && hasInternalFileDrag(event)) {
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'move';
      dropGroupId = groupRenameKey(group);
      return;
    }
    if (!canUploadFiles || !hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    dropGroupId = groupRenameKey(group);
  }

  function clearGroupDrop(event: DragEvent, group: FileGroup) {
    const currentTarget = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && currentTarget.contains(relatedTarget)) return;
    if (dropGroupId === groupRenameKey(group)) dropGroupId = '';
  }

  function markFileOrderDrop(event: DragEvent, file: FileRow) {
    if (!folderOrganizationEnabled || !canModifyFiles || busy || fileIsStorageOnly(file) || !hasInternalFileDrag(event)) return;
    const ids = draggedFileIds(event);
    if (ids.includes(file.id)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer!.dropEffect = 'move';
    orderDropFileId = file.id;
    const group = groupForFile(file);
    if (group) dropGroupId = groupRenameKey(group);
  }

  function clearFileOrderDrop(event: DragEvent, file: FileRow) {
    const currentTarget = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && currentTarget.contains(relatedTarget)) return;
    if (orderDropFileId === file.id) orderDropFileId = '';
  }

  function dropFilesOnFile(event: DragEvent, file: FileRow) {
    if (!folderOrganizationEnabled || !canModifyFiles || busy || fileIsStorageOnly(file) || !hasInternalFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const ids = movableFileIds(draggedFileIds(event));
    if (!ids.length || ids.includes(file.id)) {
      endFileDrag();
      return;
    }
    const group = groupForFile(file);
    if (!group) {
      endFileDrag();
      return;
    }
    const orderedFileIds = orderedFileIdsForDrop(group, ids, file.id);
    void reorderFilesInGroup(ids, group, orderedFileIds);
  }

  async function uploadFilesToGroup(files: File[], group: FileGroup) {
    if (!files.length) return;
    busy = true;
    notice = '';
    const folder = groupUploadFolderName(group);
    try {
      for (const file of files) {
        notice = `Uploading ${file.name} to ${group.name}...`;
        const result = await uploadProjectFile({
          projectSlug: data.project.id,
          file,
          folderName: folder,
          documentKind: uploadDocumentKind
        });
        notice = result.warning ? `${result.name} uploaded. ${result.warning}` : `${result.name} uploaded.`;
      }
      notice = files.length === 1 ? notice : `${files.length} files uploaded to ${group.name}.`;
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Upload failed.';
    } finally {
      busy = false;
    }
  }

  function dropFilesOnGroup(event: DragEvent, group: FileGroup) {
    if (!groupCanReceiveDrops(group)) return;
    if (folderOrganizationEnabled && canModifyFiles && hasInternalFileDrag(event)) {
      event.preventDefault();
      const ids = movableFileIds(draggedFileIds(event));
      if (!ids.length) {
        endFileDrag();
        return;
      }
      const orderedFileIds = orderedFileIdsForDrop(group, ids);
      void reorderFilesInGroup(ids, group, orderedFileIds);
      return;
    }
    if (!canUploadFiles || !hasDraggedFiles(event)) return;
    event.preventDefault();
    dropGroupId = '';
    void uploadFilesToGroup(Array.from(event.dataTransfer?.files ?? []), group);
  }

  function groupPagesSelected(group: FileGroup) {
    const ids = groupPageIds(group);
    return ids.length > 0 && ids.every((id) => selectedPageIds.includes(id));
  }

  function toggleGroupPages(group: FileGroup, checked: boolean) {
    const ids = groupPageIds(group);
    selectedPageIds = checked
      ? [...new Set([...selectedPageIds, ...ids])]
      : selectedPageIds.filter((id) => !ids.includes(id));
  }

  function groupFileIds(group: FileGroup) {
    return group.files.filter((file) => !fileIsStorageOnly(file)).map((file) => file.id);
  }

  function groupFilesSelected(group: FileGroup) {
    const ids = groupFileIds(group);
    return ids.length > 0 && ids.every((id) => selectedFileIds.includes(id));
  }

  function toggleGroupFiles(group: FileGroup, checked: boolean) {
    const ids = groupFileIds(group);
    selectedFileIds = checked
      ? [...new Set([...selectedFileIds, ...ids])]
      : selectedFileIds.filter((id) => !ids.includes(id));
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    busy = true;
    notice = '';
    try {
      const response = await fetch('/api/files/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectSlug: data.project.id,
          name,
          documentKind: uploadDocumentKind
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Folder could not be created.');
      if (typeof result.id === 'string' && result.id.length > 0) moveTargetFolderId = result.id;
      notice = 'Folder created.';
      newFolderName = '';
      showNewFolderForm = false;
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Folder could not be created.';
    } finally {
      busy = false;
    }
  }

  async function moveSelectedFiles() {
    if (!selectedMovableFileIds.length) return;
    const folder = moveFolderOptions.find((option) => option.id === moveTargetFolderId);
    const moveToGeneral = moveTargetFolderId === GENERAL_FOLDER_VALUE;
    if (!moveToGeneral && !folder?.id) {
      notice = 'Choose a folder first.';
      return;
    }

    busy = true;
    notice = '';
    try {
      const response = await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectSlug: data.project.id,
          fileIds: selectedMovableFileIds,
          folderId: moveToGeneral ? null : folder?.id,
          documentKind: uploadDocumentKind
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Files could not be moved.');
      const destination = moveToGeneral ? 'General' : folder?.name;
      const moved = result.moved ?? selectedMovableFileIds.length;
      const label = documentTool === 'drawings' ? 'drawing set' : 'file';
      notice = `Moved ${moved} ${label}${moved === 1 ? '' : 's'} to ${destination}.`;
      selectedPageIds = [];
      selectedFileIds = [];
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Files could not be moved.';
    } finally {
      busy = false;
    }
  }

  function startRenameGroup(group: FileGroup) {
    if (!groupCanRename(group)) {
      notice = 'This group has no registered files to move into a renamed folder yet.';
      return;
    }
    renameGroupId = groupRenameKey(group);
    renameGroupName = group.name;
    renameGroupOriginalName = group.name;
    notice = '';
  }

  function startRename(file: (typeof data.files)[number]) {
    renameId = file.id;
    renameName = file.name;
    renameFileNumber = documentNumber(file);
    renameFileTitle = documentTitle(file);
    notice = '';
  }

  function startRenamePage(page: NonNullable<(typeof data.files)[number]['pages']>[number]) {
    renamePageId = page.id;
    renamePageSheetNumber = page.sheetNumber ?? `Page ${page.pageNumber}`;
    renamePageSheetTitle = page.sheetTitle ?? page.name;
    notice = '';
  }

  async function renameGroup() {
    const name = renameGroupName.trim();
    if (!renameGroupId || !name) return;
    const group = groupedFiles.find((candidate) => groupRenameKey(candidate) === renameGroupId);
    if (!group) {
      notice = 'Group no longer exists in this view.';
      return;
    }
    busy = true;
    notice = '';
    try {
      const response = await fetch('/api/files/groups/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectSlug: data.project.id,
          folderId: group.folderId,
          name,
          documentKind: uploadDocumentKind,
          fileIds: group.folderId ? [] : group.files.filter((file) => !fileIsStorageOnly(file)).map((file) => file.id)
        })
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Group rename failed.');
      collapsedGroups = collapsedGroups.map((value) => (value === renameGroupOriginalName ? name : value));
      renameGroupId = '';
      renameGroupName = '';
      renameGroupOriginalName = '';
      notice = 'Folder updated.';
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Group rename failed.';
    } finally {
      busy = false;
    }
  }

  async function renameFile() {
    if (!renameId || (!renameName.trim() && !renameFileNumber.trim() && !renameFileTitle.trim())) return;
    busy = true;
    notice = '';
    try {
      const response = await fetch(fileEndpoint(renameId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: renameName.trim(),
          sheetNumber: renameFileNumber.trim(),
          sheetTitle: renameFileTitle.trim()
        })
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Rename failed.');
      renameId = '';
      renameName = '';
      renameFileNumber = '';
      renameFileTitle = '';
      notice = 'Name updated.';
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Rename failed.';
    } finally {
      busy = false;
    }
  }

  async function renamePage(file: (typeof data.files)[number]) {
    if (!renamePageId || (!renamePageSheetNumber.trim() && !renamePageSheetTitle.trim())) return;
    busy = true;
    notice = '';
    try {
      const response = await fetch(pageEndpoint(file.id, renamePageId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetNumber: renamePageSheetNumber.trim(),
          sheetTitle: renamePageSheetTitle.trim()
        })
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Page rename failed.');
      renamePageId = '';
      notice = 'Sheet page updated.';
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Page rename failed.';
    } finally {
      busy = false;
    }
  }

  async function deleteFile(file: (typeof data.files)[number]) {
    const ok = confirm(`Delete "${file.name}" from this project?`);
    if (!ok) return;

    busy = true;
    notice = '';
    try {
      const response = await fetch(fileEndpoint(file.id), { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Delete failed.');
      notice = 'File deleted.';
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Delete failed.';
    } finally {
      busy = false;
    }
  }

  async function deleteFolder(group: FileGroup) {
    if (!group.folderId) return;
    const ok = confirm(`Delete the "${group.name}" folder? Files inside it will move to General.`);
    if (!ok) return;

    busy = true;
    notice = '';
    try {
      const response = await fetch(
        `/api/files/folders/${encodeURIComponent(group.folderId)}?projectSlug=${encodeURIComponent(data.project.id)}`,
        { method: 'DELETE' }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Folder could not be deleted.');
      const moved = result.moved ?? 0;
      notice = moved ? `Folder deleted. ${moved} file${moved === 1 ? '' : 's'} moved to General.` : 'Folder deleted.';
      collapsedGroups = collapsedGroups.filter((name) => name !== group.name);
      selectedPageIds = [];
      selectedFileIds = [];
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Folder could not be deleted.';
    } finally {
      busy = false;
    }
  }

  async function reindexFile(file: (typeof data.files)[number]) {
    const ok = confirm(`Re-index OCR for "${file.name}"? This will replace the detected sheet numbers and titles for this file.`);
    if (!ok) return;

    busy = true;
    notice = '';
    try {
      const response = await fetch(reindexEndpoint(file.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, documentKind: reindexDocumentKind() })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'OCR re-index failed.');
      notice =
        result.ocrStatus === 'skipped'
          ? 'OCR was skipped for this file type.'
          : result.ocrDeferred
            ? 'OCR is pending for this file.'
            : 'OCR re-indexed.';
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'OCR re-index failed.';
    } finally {
      busy = false;
    }
  }

  async function reindexGroup(group: FileGroup) {
    const files = groupOcrFiles(group);
    if (!files.length) return;
    const ok = confirm(`Run OCR for ${files.length} PDF drawing set${files.length === 1 ? '' : 's'} in "${group.name}"? This will replace detected sheet numbers and titles.`);
    if (!ok) return;

    busy = true;
    notice = `Running OCR for ${group.name}...`;
    let completed = 0;
    let deferred = 0;
    let failed = 0;
    try {
      for (const file of files) {
        const response = await fetch(reindexEndpoint(file.id), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true, documentKind: 'drawing' })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          failed += 1;
          continue;
        }
        if (result.ocrDeferred) deferred += 1;
        else completed += 1;
      }
      notice = `OCR finished for ${completed} drawing set${completed === 1 ? '' : 's'}${deferred ? `; ${deferred} still pending` : ''}${failed ? `; ${failed} failed` : ''}.`;
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'OCR re-index failed.';
    } finally {
      busy = false;
    }
  }

  async function copyFileLink(file: (typeof data.files)[number]) {
    await navigator.clipboard?.writeText(location.origin + `/api/files/${encodeURIComponent(file.id)}/download`);
    notice = 'Link copied.';
  }

  async function createShareLink(file: (typeof data.files)[number]) {
    if (fileIsStorageOnly(file)) {
      notice = 'Storage-only files need to be registered before external sharing.';
      return;
    }
    busy = true;
    notice = '';
    try {
      const form = new FormData();
      form.set('days', '7');
      if (file.type === 'image') {
        const emails = prompt('Email this photo share link to recipients (comma separated), or leave blank to only copy the link.');
        if (emails) form.set('emails', emails);
      }
      const response = await fetch(`/api/files/${encodeURIComponent(file.id)}/share`, { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Share link failed.');
      await navigator.clipboard?.writeText(result.url);
      notice = `External share link copied for ${file.name}.`;
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Share link failed.';
    } finally {
      busy = false;
    }
  }

  async function downloadBlob(response: Response, fallbackName: string) {
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') ?? '';
    const filename = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? '') || fallbackName;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportSelectedPages(mode: 'combined' | 'separate') {
    if (!selectedPageIds.length) return;
    busy = true;
    notice = '';
    try {
      const response = await fetch('/api/files/pages/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIds: selectedPageIds, mode })
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Export failed.');
      await downloadBlob(response, mode === 'separate' ? 'drawing-pages.zip' : 'drawing-pages.pdf');
      notice = `Exported ${selectedPageIds.length} drawing page${selectedPageIds.length === 1 ? '' : 's'}.`;
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Export failed.';
    } finally {
      busy = false;
    }
  }

  async function deleteSelectedPages() {
    if (!selectedPageIds.length) return;
    const ok = confirm(`Delete ${selectedPageIds.length} selected drawing page${selectedPageIds.length === 1 ? '' : 's'} from the drawing log?`);
    if (!ok) return;

    busy = true;
    notice = '';
    try {
      const response = await fetch('/api/files/pages/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageIds: selectedPageIds })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Delete failed.');
      notice =
        result.deletedFiles > 0
          ? `Deleted ${result.deletedFiles} drawing set${result.deletedFiles === 1 ? '' : 's'} from the log.`
          : `Deleted ${result.deleted ?? selectedPageIds.length} drawing page${(result.deleted ?? selectedPageIds.length) === 1 ? '' : 's'}.`;
      if (result.warning) notice = `${notice} ${result.warning}`;
      selectedPageIds = [];
      await invalidateAll();
    } catch (error) {
      notice = error instanceof Error ? error.message : 'Delete failed.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>{toolTitle} | {data.project.title}</title>
</svelte:head>

<PageShell wide>
  <section class="tool-heading">
    <div class="min-w-0">
      <h1>{toolTitle}</h1>
      <p>
        {documentTool === 'specifications'
          ? 'Keep project specifications separate from drawing revisions and file uploads.'
          : documentTool === 'documents'
            ? 'Store general project documents, meeting notes, contracts, schedules, photos, and shared references.'
          : 'View current drawings, revision status, published sets, and project downloads.'}
      </p>
    </div>
    <div class="tool-actions">
      {#if canUploadFiles}
        <FileUploadButton
          projectSlug={data.project.id}
          folderName={uploadFolder}
          documentKind={uploadDocumentKind}
          folderEditable={uploadFolderEditable}
          folderLabel={uploadFolderLabel}
          folderPlaceholder={uploadFolderPlaceholder}
          folderOptions={uploadFolderOptions}
        />
      {:else}
        <span class="readonly-chip">Read-only access</span>
      {/if}
    </div>
  </section>

  {#if notice}
    <div class="mb-3 rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-pe-sub">{notice}</div>
  {/if}

  <section class="workbench documents-workbench">
    <div class="log-area">
      <div class="log-toolbar">
        <div class="searchbox">
          <Search size={16} />
          <input bind:value={query} placeholder="Search" />
        </div>
        {#if canModifyFiles && folderOrganizationEnabled}
          <div class="folder-tools">
            {#if showNewFolderForm}
              <form
                class="folder-inline-form"
                onsubmit={(event) => {
                  event.preventDefault();
                  void createFolder();
                }}
              >
                <input class="field compact folder-name-field" bind:value={newFolderName} placeholder="Folder name" aria-label="New folder name" />
                <button class="mini-button" type="submit" disabled={busy || !newFolderName.trim()}>
                  <Check size={14} />
                  Create
                </button>
                <button
                  class="icon-row-button quiet"
                  type="button"
                  disabled={busy}
                  onclick={() => {
                    showNewFolderForm = false;
                    newFolderName = '';
                  }}
                  aria-label="Cancel new folder"
                >
                  <X size={15} />
                </button>
              </form>
            {:else}
              <button class="mini-button" type="button" disabled={busy} onclick={() => (showNewFolderForm = true)}>
                <FolderPlus size={14} />
                New folder
              </button>
            {/if}
            {#if selectedMovableFileIds.length}
              <select class="field compact folder-select" bind:value={moveTargetFolderId} aria-label="Move selected files to folder">
                <option value={GENERAL_FOLDER_VALUE}>General</option>
                {#each moveFolderOptions as folder}
                  <option value={folder.id}>{folder.name}</option>
                {/each}
              </select>
              <button class="mini-button" type="button" disabled={busy} onclick={moveSelectedFiles}>
                <MoveRight size={14} />
                Move
              </button>
            {/if}
          </div>
        {/if}
        <span class="result-count">{filteredFiles.length} shown</span>
        {#if documentTool === 'drawings' && selectedPageIds.length}
          <div class="bulk-actions" aria-label="Selected drawing page actions">
            <span>{selectedPageIds.length} selected</span>
            <button class="mini-button" type="button" disabled={busy} onclick={() => exportSelectedPages('combined')}>
              <Download size={14} />
              Combined PDF
            </button>
            <button class="mini-button" type="button" disabled={busy} onclick={() => exportSelectedPages('separate')}>
              <Download size={14} />
              Single pages
            </button>
            {#if canDeleteFiles}
              <button class="mini-button danger" type="button" disabled={busy} onclick={deleteSelectedPages}>
                <Trash2 size={14} />
                Delete
              </button>
            {/if}
          </div>
        {/if}
      </div>

      <div class="dense-table-shell">
        <table class="dense-table drawings-table">
          <colgroup>
            <col class="select-col" />
            <col class="number-col" />
            <col class="title-col" />
            <col class="revision-col" />
            <col class="date-col" />
            <col class="location-col" />
            <col class="actions-col" />
          </colgroup>
          <thead>
            <tr>
              <th class="select-cell">
                {#if documentTool === 'drawings'}
                  <input
                    type="checkbox"
                    aria-label={`Select all visible ${toolTitle} pages`}
                    checked={allVisiblePagesSelected}
                    disabled={!visibleDrawingPages.length}
                    onchange={(event) => toggleVisiblePages(event.currentTarget.checked)}
                  />
                {:else if documentTool === 'documents'}
                  <input
                    type="checkbox"
                    aria-label="Select all visible documents"
                    checked={allVisibleDocumentsSelected}
                    disabled={!visibleDocumentFiles.length}
                    onchange={(event) => toggleVisibleDocuments(event.currentTarget.checked)}
                  />
                {/if}
              </th>
              <th>{documentTool === 'specifications' ? 'Section' : documentTool === 'documents' ? 'File' : 'Number'}</th>
              <th>{documentTool === 'specifications' ? 'Specification Title' : documentTool === 'documents' ? 'Document' : 'Drawing Title'}</th>
              <th>{documentTool === 'documents' ? 'Type' : 'Revision'}</th>
              <th>{documentTool === 'drawings' ? 'Drawing Date' : 'Uploaded'}</th>
              <th>{documentTool === 'drawings' ? 'Set' : 'Folder'}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each groupedFiles as group}
              <tr
                class="group-row"
                class:collapsed-row={groupIsCollapsed(group.name)}
                class:drop-target={groupCanReceiveDrops(group)}
                class:drop-active={dropGroupId === groupRenameKey(group)}
                ondragenter={(event) => markGroupDrop(event, group)}
                ondragover={(event) => markGroupDrop(event, group)}
                ondragleave={(event) => clearGroupDrop(event, group)}
                ondrop={(event) => dropFilesOnGroup(event, group)}
              >
                <td class="group-control-cell">
                  <button
                    class="group-toggle"
                    type="button"
                    onclick={() => toggleGroupCollapsed(group.name)}
                    aria-label={`${groupIsCollapsed(group.name) ? 'Expand' : 'Collapse'} ${group.name}`}
                  >
                    {#if groupIsCollapsed(group.name)}
                      <ChevronRight size={15} />
                    {:else}
                      <ChevronDown size={15} />
                    {/if}
                  </button>
                  {#if documentTool === 'drawings'}
                    <input
                      type="checkbox"
                      aria-label={`Select all sheets in ${group.name}`}
                      checked={groupPagesSelected(group)}
                      disabled={!groupPageIds(group).length}
                      onchange={(event) => toggleGroupPages(group, event.currentTarget.checked)}
                    />
                  {:else if documentTool === 'documents'}
                    <input
                      type="checkbox"
                      aria-label={`Select all documents in ${group.name}`}
                      checked={groupFilesSelected(group)}
                      disabled={!groupFileIds(group).length}
                      onchange={(event) => toggleGroupFiles(group, event.currentTarget.checked)}
                    />
                  {/if}
                </td>
                <td class="group-name-cell" colspan="5">
                  {#if renameGroupId === groupRenameKey(group)}
                    <input class="field group-rename-field" bind:value={renameGroupName} aria-label="Folder name" />
                  {:else}
                    <div class="group-label">
                      <button class="group-name-button" type="button" onclick={() => toggleGroupCollapsed(group.name)}>
                        {group.name} ({group.count})
                      </button>
                    </div>
                  {/if}
                </td>
                <td class="group-action-cell">
                  <div class="row-actions group-actions">
                    {#if renameGroupId === groupRenameKey(group)}
                      <button class="icon-row-button primary success" type="button" disabled={busy} onclick={renameGroup} aria-label="Save folder name">
                        <Check size={15} />
                      </button>
                      <button
                        class="icon-row-button quiet"
                        type="button"
                        disabled={busy}
                        onclick={() => {
                          renameGroupId = '';
                          renameGroupName = '';
                          renameGroupOriginalName = '';
                        }}
                        aria-label="Cancel folder edit"
                      >
                        <X size={15} />
                      </button>
                    {:else}
                      {#if canModifyFiles && groupCanRename(group)}
                        <button class="group-edit-button" type="button" disabled={busy} onclick={() => startRenameGroup(group)} aria-label={`Rename ${group.name} folder`}>
                          <Pencil size={12} />
                          <span>Edit</span>
                        </button>
                      {/if}
                      {#if canModifyFiles && group.folderId}
                        <button class="group-edit-button danger" type="button" disabled={busy} onclick={() => deleteFolder(group)} aria-label={`Delete ${group.name} folder`}>
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      {/if}
                      {#if documentTool === 'drawings' && canReindexFiles && groupOcrFiles(group).length}
                        <button class="group-edit-button" type="button" disabled={busy} onclick={() => reindexGroup(group)} aria-label={`Run OCR for ${group.name} group`}>
                          <RefreshCw size={12} />
                          <span>OCR</span>
                        </button>
                      {/if}
                    {/if}
                  </div>
                </td>
              </tr>

              {#if !groupIsCollapsed(group.name)}
                {#if !group.files.length}
                  <tr class="empty-folder-row">
                    <td class="select-cell"></td>
                    <td colspan="6">No {toolTitle.toLowerCase()} in this folder yet.</td>
                  </tr>
                {:else if documentTool === 'drawings'}
                  {#each group.files as file}
                    {#if file.pages?.length}
                      {#each file.pages as pageRow}
                        <tr
                          class="page-row sheet-row"
                          class:editing-row={renamePageId === pageRow.id}
                          class:dragging-row={draggingFileIds.includes(file.id)}
                          class:order-drop-target={orderDropFileId === file.id}
                          draggable={folderOrganizationEnabled && canModifyFiles && !fileIsStorageOnly(file)}
                          ondragstart={(event) => startFileDrag(event, file)}
                          ondragend={endFileDrag}
                          ondragenter={(event) => markFileOrderDrop(event, file)}
                          ondragover={(event) => markFileOrderDrop(event, file)}
                          ondragleave={(event) => clearFileOrderDrop(event, file)}
                          ondrop={(event) => dropFilesOnFile(event, file)}
                        >
                          <td class="select-cell">
                            <input
                              type="checkbox"
                              aria-label={`Select ${pageRow.name}`}
                              checked={pageSelected(pageRow.id)}
                              onchange={(event) => togglePage(pageRow.id, event.currentTarget.checked)}
                            />
                          </td>
                          <td class="sheet-number-cell">
                            {#if renamePageId === pageRow.id}
                              <input class="field sheet-edit-number" bind:value={renamePageSheetNumber} aria-label="Sheet number" />
                            {:else if fileHasStorage(file) && fileIsPdf(file)}
                              <a class="record-link" href={viewerHref(file.id, pageRow.pageNumber)}>{pageRow.sheetNumber ?? `Page ${pageRow.pageNumber}`}</a>
                            {:else}
                              <span class="record-link muted-link">{pageRow.sheetNumber ?? `Page ${pageRow.pageNumber}`}</span>
                            {/if}
                          </td>
                          <td>
                            {#if renamePageId === pageRow.id}
                              <input class="field sheet-edit-title" bind:value={renamePageSheetTitle} placeholder="Drawing title" aria-label="Drawing title" />
                            {:else}
                              <span class="record-title page-title">
                                <span>{pageRow.sheetTitle ?? pageRow.name}</span>
                              </span>
                            {/if}
                          </td>
                          <td>{pageRow.revision ?? revisionFor(file)}</td>
                          <td>{formatDate(file.updatedAt)}</td>
                          <td>
                            {#if fileHasStorage(file) && fileIsPdf(file)}
                              <a class="set-link" href={viewerHref(file.id)}>{file.name}</a>
                            {:else}
                              <span class="set-link">{file.name}</span>
                            {/if}
                          </td>
                          <td>
                            <div class="row-actions">
                              {#if renamePageId === pageRow.id}
                                <button class="icon-row-button primary success" type="button" disabled={busy} onclick={() => renamePage(file)} aria-label="Save drawing page">
                                  <Check size={15} />
                                </button>
                                <button class="icon-row-button quiet" type="button" disabled={busy} onclick={() => (renamePageId = '')} aria-label="Cancel drawing page edit">
                                  <X size={15} />
                                </button>
                              {:else if fileHasStorage(file)}
                                <a class="icon-row-button" href={`/api/files/${encodeURIComponent(file.id)}/download?download=1`} aria-label={`Download ${pageRow.name}`}>
                                  <Download size={15} />
                                </a>
                                <button class="icon-row-button" type="button" onclick={() => copyFileLink(file)} aria-label={`Copy link for ${pageRow.name}`}>
                                  <Copy size={15} />
                                </button>
                                {#if canDeleteFiles && !fileIsStorageOnly(file)}
                                  <button class="icon-row-button" type="button" disabled={busy} onclick={() => createShareLink(file)} aria-label={`Create external share link for ${pageRow.name}`}>
                                    <Link size={15} />
                                  </button>
                                {/if}
                              {/if}
                              {#if renamePageId !== pageRow.id && canModifyFiles && !fileIsStorageOnly(file)}
                                <button class="icon-row-button" type="button" disabled={busy} onclick={() => startRenamePage(pageRow)} aria-label={`Rename ${pageRow.name}`}>
                                  <Pencil size={15} />
                                </button>
                              {/if}
                            </div>
                          </td>
                        </tr>
                      {/each}
                    {:else}
                      <tr
                        class="page-row sheet-row"
                        class:dragging-row={draggingFileIds.includes(file.id)}
                        class:order-drop-target={orderDropFileId === file.id}
                        draggable={folderOrganizationEnabled && canModifyFiles && !fileIsStorageOnly(file)}
                        ondragstart={(event) => startFileDrag(event, file)}
                        ondragend={endFileDrag}
                        ondragenter={(event) => markFileOrderDrop(event, file)}
                        ondragover={(event) => markFileOrderDrop(event, file)}
                        ondragleave={(event) => clearFileOrderDrop(event, file)}
                        ondrop={(event) => dropFilesOnFile(event, file)}
                      >
                        <td class="select-cell">
                          <input
                            type="checkbox"
                            aria-label={`Select ${file.name}`}
                            checked={fileSelected(file.id)}
                            disabled={fileIsStorageOnly(file)}
                            onchange={(event) => toggleFileSelection(file.id, event.currentTarget.checked)}
                          />
                        </td>
                        <td class="sheet-number-cell">
                          {#if renameId === file.id}
                            <input class="field sheet-edit-number" bind:value={renameFileNumber} aria-label="Drawing number" />
                          {:else if fileHasStorage(file) && fileIsPdf(file)}
                            <a class="record-link" href={viewerHref(file.id)}>{documentNumber(file)}</a>
                          {:else if fileHasStorage(file)}
                            <a class="record-link" href={`/api/files/${encodeURIComponent(file.id)}/download?download=1`}>{documentNumber(file)}</a>
                          {:else}
                            <span class="record-link muted-link">{documentNumber(file)}</span>
                          {/if}
                        </td>
                        <td>
                          {#if renameId === file.id}
                            <input class="field sheet-edit-title" bind:value={renameFileTitle} placeholder="Drawing title" aria-label="Drawing title" />
                          {:else}
                            <span class="record-title page-title">
                              <span>{documentTitle(file)}</span>
                            </span>
                          {/if}
                        </td>
                        <td>{revisionFor(file)}</td>
                        <td>{formatDate(file.updatedAt)}</td>
                        <td><span class="set-link">{file.path}</span></td>
                        <td>
                          <div class="row-actions">
                            {#if fileHasStorage(file)}
                              <a class="icon-row-button" href={`/api/files/${encodeURIComponent(file.id)}/download?download=1`} aria-label={`Download ${file.name}`}>
                                <Download size={15} />
                              </a>
                              <button class="icon-row-button" type="button" onclick={() => copyFileLink(file)} aria-label={`Copy link for ${file.name}`}>
                                <Copy size={15} />
                              </button>
                              {#if canDeleteFiles && !fileIsStorageOnly(file)}
                                <button class="icon-row-button" type="button" disabled={busy} onclick={() => createShareLink(file)} aria-label={`Create external share link for ${file.name}`}>
                                  <Link size={15} />
                                </button>
                              {/if}
                            {/if}
                            {#if renameId === file.id}
                              <button class="icon-row-button primary success" type="button" disabled={busy} onclick={renameFile} aria-label="Save file details">
                                <Check size={15} />
                              </button>
                              <button
                                class="icon-row-button quiet"
                                type="button"
                                disabled={busy}
                                onclick={() => {
                                  renameId = '';
                                  renameName = '';
                                  renameFileNumber = '';
                                  renameFileTitle = '';
                                }}
                                aria-label="Cancel file edit"
                              >
                                <X size={15} />
                              </button>
                            {/if}
                            {#if renameId !== file.id && canReindexFiles && !fileIsStorageOnly(file) && fileIsPdf(file)}
                              <button class="icon-row-button" type="button" disabled={busy} onclick={() => reindexFile(file)} aria-label={`Re-index OCR for ${file.name}`}>
                                <RefreshCw size={15} />
                              </button>
                            {/if}
                            {#if renameId !== file.id && canModifyFiles && !fileIsStorageOnly(file)}
                              <button class="icon-row-button" type="button" disabled={busy} onclick={() => startRename(file)} aria-label={`Rename ${file.name}`}>
                                <Pencil size={15} />
                              </button>
                            {/if}
                            {#if canDeleteFiles}
                              <button class="icon-row-button danger" type="button" disabled={busy} onclick={() => deleteFile(file)} aria-label={`Delete ${file.name}`}>
                                <Trash2 size={15} />
                              </button>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/if}
                  {/each}
                {:else}
                  {#each group.files as file}
                    <tr
                      class:dragging-row={draggingFileIds.includes(file.id)}
                      class:order-drop-target={orderDropFileId === file.id}
                      draggable={folderOrganizationEnabled && canModifyFiles && !fileIsStorageOnly(file)}
                      ondragstart={(event) => startFileDrag(event, file)}
                      ondragend={endFileDrag}
                      ondragenter={(event) => markFileOrderDrop(event, file)}
                      ondragover={(event) => markFileOrderDrop(event, file)}
                      ondragleave={(event) => clearFileOrderDrop(event, file)}
                      ondrop={(event) => dropFilesOnFile(event, file)}
                    >
                      <td class="select-cell">
                        {#if documentTool === 'documents'}
                          <input
                            type="checkbox"
                            aria-label={`Select ${file.name}`}
                            checked={fileSelected(file.id)}
                            disabled={fileIsStorageOnly(file)}
                            onchange={(event) => toggleFileSelection(file.id, event.currentTarget.checked)}
                          />
                        {/if}
                      </td>
                      <td>
                        {#if renameId === file.id}
                          <input class="field sheet-edit-number" bind:value={renameFileNumber} aria-label={documentTool === 'specifications' ? 'Specification section' : 'File number'} />
                        {:else if fileHasStorage(file) && fileIsPdf(file)}
                          <a class="record-link" href={viewerHref(file.id)}>{documentNumber(file)}</a>
                        {:else if fileHasStorage(file)}
                          <a class="record-link" href={`/api/files/${encodeURIComponent(file.id)}/download?download=1`}>{documentNumber(file)}</a>
                        {:else}
                          <span class="record-link muted-link">{documentNumber(file)}</span>
                        {/if}
                      </td>
                      <td>
                        {#if renameId === file.id}
                          <input class="field sheet-edit-title" bind:value={renameFileTitle} placeholder={documentTool === 'specifications' ? 'Specification title' : 'Document title'} aria-label={documentTool === 'specifications' ? 'Specification title' : 'Document title'} />
                        {:else}
                          <span class="record-title">
                            <FileText size={14} />
                            <span>{documentTitle(file)}</span>
                          </span>
                        {/if}
                      </td>
                      <td>{documentTool === 'documents' ? file.type.toUpperCase() : revisionFor(file)}</td>
                      <td>{formatDate(file.updatedAt)}</td>
                      <td><span class="set-link">{file.path}</span></td>
                      <td>
                        <div class="row-actions">
                          {#if fileHasStorage(file)}
                            <a class="icon-row-button" href={`/api/files/${encodeURIComponent(file.id)}/download?download=1`} aria-label={`Download ${file.name}`}>
                              <Download size={15} />
                            </a>
                            <button class="icon-row-button" type="button" onclick={() => copyFileLink(file)} aria-label={`Copy link for ${file.name}`}>
                              <Copy size={15} />
                            </button>
                            {#if canDeleteFiles && !fileIsStorageOnly(file)}
                              <button class="icon-row-button" type="button" disabled={busy} onclick={() => createShareLink(file)} aria-label={`Create external share link for ${file.name}`}>
                                <Link size={15} />
                              </button>
                            {/if}
                          {/if}
                          {#if renameId === file.id}
                            <button class="icon-row-button primary success" type="button" disabled={busy} onclick={renameFile} aria-label="Save file details">
                              <Check size={15} />
                            </button>
                            <button
                              class="icon-row-button quiet"
                              type="button"
                              disabled={busy}
                              onclick={() => {
                                renameId = '';
                                renameName = '';
                                renameFileNumber = '';
                                renameFileTitle = '';
                              }}
                              aria-label="Cancel file edit"
                            >
                              <X size={15} />
                            </button>
                          {/if}
                          {#if renameId !== file.id && canReindexFiles && !fileIsStorageOnly(file) && fileIsPdf(file)}
                            <button class="icon-row-button" type="button" disabled={busy} onclick={() => reindexFile(file)} aria-label={`Re-index OCR for ${file.name}`}>
                              <RefreshCw size={15} />
                            </button>
                          {/if}
                          {#if renameId !== file.id && canModifyFiles && !fileIsStorageOnly(file)}
                            <button class="icon-row-button" type="button" disabled={busy} onclick={() => startRename(file)} aria-label={`Rename ${file.name}`}>
                              <Pencil size={15} />
                            </button>
                          {/if}
                          {#if canDeleteFiles}
                            <button class="icon-row-button danger" type="button" disabled={busy} onclick={() => deleteFile(file)} aria-label={`Delete ${file.name}`}>
                              <Trash2 size={15} />
                            </button>
                          {/if}
                        </div>
                      </td>
                    </tr>
                  {/each}
                {/if}
              {/if}
            {:else}
              <tr>
                <td colspan="7">
                  <div class="empty-log">
                    <strong>No {toolTitle.toLowerCase()} match this view.</strong>
                    <span>Upload files to this project, or adjust search and filters.</span>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>
</PageShell>

<style>
  .documents-workbench {
    grid-template-columns: minmax(0, 1fr);
  }

  .log-toolbar {
    flex-wrap: wrap;
  }

  .folder-tools,
  .folder-inline-form {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .folder-name-field {
    width: min(13rem, 100%);
  }

  .folder-select {
    width: min(12rem, 100%);
  }

  .drawings-table {
    min-width: 0;
    table-layout: fixed;
  }

  .dense-table-shell {
    overflow: visible;
  }

  .select-col {
    width: 3.3rem;
  }

  .number-col {
    width: 7.5rem;
  }

  .title-col {
    width: auto;
  }

  .revision-col {
    width: 5rem;
  }

  .date-col {
    width: 8.5rem;
  }

  .location-col {
    width: 12rem;
  }

  .actions-col {
    width: 15rem;
  }

  .select-cell {
    text-align: center;
  }

  .select-cell input {
    width: 1rem;
    height: 1rem;
    accent-color: #191b19;
  }

  .group-control-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding-inline: 0.35rem !important;
  }

  .group-control-cell input {
    width: 1rem;
    height: 1rem;
    accent-color: #191b19;
  }

  .group-toggle,
  .group-edit-button,
  .group-name-button {
    display: inline-flex;
    align-items: center;
    border: 0;
    background: transparent;
    color: inherit;
  }

  .group-toggle {
    justify-content: center;
    width: 1.3rem;
    height: 1.3rem;
    border-radius: 0.2rem;
    color: #59615a;
  }

  .group-toggle:hover,
  .group-edit-button:hover {
    background: rgba(25, 27, 25, 0.07);
  }

  .group-label {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .group-name-cell {
    min-width: 0;
  }

  .group-name-button {
    min-width: 0;
    padding: 0;
    font-weight: 850;
    text-align: left;
  }

  .group-action-cell {
    overflow: visible !important;
    white-space: nowrap;
  }

  .group-actions {
    justify-content: flex-start;
    flex-wrap: nowrap;
  }

  .group-edit-button {
    justify-content: center;
    gap: 0.18rem;
    min-height: 1.25rem;
    border: 1px solid rgba(25, 27, 25, 0.08);
    border-radius: 0.22rem;
    background: rgba(255, 255, 255, 0.55);
    padding: 0.06rem 0.32rem;
    color: #3f4640;
    font-size: 0.64rem;
    font-weight: 900;
    line-height: 1;
  }

  .group-edit-button.danger {
    border-color: rgba(180, 35, 24, 0.2);
    color: #b42318;
  }

  .group-edit-button.danger:hover {
    background: #fff1ef;
  }

  .group-edit-button:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .group-rename-field {
    max-width: 24rem;
    min-height: 1.95rem;
    border-color: #ff6a2a;
    border-radius: 0.3rem;
    padding: 0.34rem 0.48rem;
    font-size: 0.78rem;
    font-weight: 850;
    box-shadow: 0 0 0 2px rgba(255, 106, 42, 0.08);
  }

  .collapsed-row td {
    border-bottom-color: #d8ddd7;
  }

  .empty-folder-row td {
    background: #fbfcfb;
    color: #6b746b;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .drawings-table .group-row.drop-target td {
    transition:
      background-color 140ms ease,
      box-shadow 140ms ease;
  }

  .drawings-table .group-row.drop-active td {
    background: #eaf8ee !important;
    box-shadow: inset 0 2px 0 rgba(24, 165, 58, 0.72), inset 0 -2px 0 rgba(24, 165, 58, 0.72);
  }

  .drawings-table tr[draggable='true'] td {
    cursor: grab;
  }

  .drawings-table tr[draggable='true']:active td {
    cursor: grabbing;
  }

  .drawings-table tr.dragging-row td {
    opacity: 0.58;
  }

  .drawings-table tr.order-drop-target td {
    background: #fff7f2 !important;
    box-shadow: inset 0 2px 0 rgba(255, 106, 42, 0.8);
  }

  .drawings-table th,
  .drawings-table td {
    overflow: hidden;
  }

  .drawings-table td:last-child {
    overflow: visible;
  }

  .bulk-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    flex-wrap: wrap;
  }

  .bulk-actions span {
    color: #3f4640;
    font-size: 0.76rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .mini-button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    white-space: nowrap;
  }

  .mini-button.danger {
    color: #b42318;
    border-color: rgba(180, 35, 24, 0.28);
    background: #fff8f7;
  }

  :global(.row-actions) {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .record-title {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    max-width: 100%;
    color: #202220;
    font-weight: 750;
    text-align: left;
  }

  .record-title span,
  .set-link {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .set-link {
    display: block;
    max-width: 100%;
    color: #1a5fb4;
    text-decoration: underline;
  }

  .muted-link {
    color: #647064;
    text-decoration: none;
  }

  .page-row td {
    background: #fbfcfb;
    color: #4d554d;
  }

  .page-row.editing-row td {
    background: #fff9f6;
  }

  .page-row:hover td {
    background: #f4f7f4;
  }

  .page-row.editing-row:hover td {
    background: #fff9f6;
  }

  .page-title {
    padding-left: 0.8rem;
    font-weight: 700;
  }

  .sheet-number-cell {
    padding-left: 1.15rem !important;
  }

  .sheet-edit-number,
  .sheet-edit-title {
    min-height: 1.95rem;
    border-color: #ff6a2a;
    border-radius: 0.3rem;
    padding: 0.34rem 0.48rem;
    font-size: 0.78rem;
    font-weight: 850;
    box-shadow: 0 0 0 2px rgba(255, 106, 42, 0.08);
  }

  .sheet-edit-title {
    max-width: 30rem;
    font-weight: 750;
  }

  .icon-row-button.success {
    border-color: rgba(24, 165, 58, 0.34);
    background: #eefaf1;
    color: #12812d;
  }

  .icon-row-button.quiet {
    border-color: transparent;
    color: #7b827b;
  }

  @media (max-width: 1050px) {
    .location-col,
    .drawings-table th:nth-child(6),
    .drawings-table td:nth-child(6) {
      display: none;
    }

    .actions-col {
      width: 13rem;
    }
  }

  @media (max-width: 780px) {
    .date-col,
    .revision-col,
    .drawings-table th:nth-child(4),
    .drawings-table td:nth-child(4),
    .drawings-table th:nth-child(5),
    .drawings-table td:nth-child(5) {
      display: none;
    }

    .number-col {
      width: 6rem;
    }

    .actions-col {
      width: 11.5rem;
    }
  }

  @media (max-width: 560px) {
    .drawings-table {
      font-size: 0.72rem;
    }

    .number-col {
      width: 5rem;
    }

    .actions-col {
      width: 9rem;
    }

    .icon-row-button {
      width: 1.65rem;
      height: 1.65rem;
    }
  }

  @media (max-width: 900px) {
    .documents-workbench {
      grid-template-columns: 1fr;
    }
  }
</style>
