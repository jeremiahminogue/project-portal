<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    Check,
    Copy,
    Download,
    FileText,
    Pencil,
    RefreshCw,
    Search,
    Trash2,
    X
  } from '@lucide/svelte';
  import FileUploadButton from '$lib/components/FileUploadButton.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  let { data } = $props();
  let query = $state('');
  let activeFolder = $state('All files');
  let renameId = $state('');
  let renameName = $state('');
  let renamePageId = $state('');
  let renamePageSheetNumber = $state('');
  let renamePageSheetTitle = $state('');
  let busy = $state(false);
  let notice = $state('');
  let selectedPageIds = $state<string[]>([]);

  const documentTool = $derived($page.url.searchParams.get('tool') === 'specifications' ? 'specifications' : 'drawings');
  const toolTitle = $derived(documentTool === 'specifications' ? 'Specifications' : 'Drawings');
  const canModifyFiles = $derived(Boolean(data.fileAccess?.canModify));
  const canUploadFiles = $derived(Boolean(data.fileAccess?.canUpload));
  const canDeleteFiles = $derived(Boolean(data.fileAccess?.canDelete));
  const canReindexFiles = $derived(Boolean(data.fileAccess?.canReindex));
  const uploadFolder = $derived(activeFolder === 'All files' ? '' : activeFolder);

  const toolFiles = $derived(data.files.filter((file) => (documentTool === 'specifications' ? isSpecification(file) : !isSpecification(file))));
  const filteredFiles = $derived(
    toolFiles.filter((file) => {
      const folderOk = activeFolder === 'All files' || file.path.startsWith(`${activeFolder}/`);
      const queryOk = !query || `${file.name} ${file.path} ${file.tags?.join(' ') ?? ''}`.toLowerCase().includes(query.toLowerCase());
      return folderOk && queryOk;
    })
  );
  const groupedFiles = $derived(
    [...new Set(filteredFiles.map((file) => folderName(file)))]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        files: filteredFiles.filter((file) => folderName(file) === name)
      }))
  );
  const visibleDrawingPages = $derived(
    documentTool === 'drawings'
      ? filteredFiles.flatMap((file) => (file.pages ?? []).map((page) => ({ file, page })))
      : []
  );
  const selectedVisiblePageCount = $derived(visibleDrawingPages.filter(({ page }) => selectedPageIds.includes(page.id)).length);
  const allVisiblePagesSelected = $derived(
    visibleDrawingPages.length > 0 && visibleDrawingPages.every(({ page }) => selectedPageIds.includes(page.id))
  );

  function isSpecification(file: (typeof data.files)[number]) {
    if (file.documentKind === 'specification') return true;
    if (file.documentKind === 'drawing') return false;
    const haystack = `${file.name} ${file.path} ${file.tags?.join(' ') ?? ''}`.toLowerCase();
    return haystack.includes('spec') || haystack.includes('specification') || haystack.includes('division ');
  }

  function folderName(file: (typeof data.files)[number]) {
    return file.path.includes('/') ? file.path.split('/')[0] : 'General';
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

  function statusFor(file: (typeof data.files)[number]) {
    if (file.ocrStatus === 'indexed') return 'Indexed';
    if (file.ocrStatus === 'partial') return 'Partial';
    if (file.ocrStatus === 'failed') return 'OCR Failed';
    if (file.ocrStatus === 'pending') return 'Pending';
    return file.storageKey ? 'Published' : 'Pending';
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

  function filePageIds(file: (typeof data.files)[number]) {
    return (file.pages ?? []).map((page) => page.id);
  }

  function pageSelected(pageId: string) {
    return selectedPageIds.includes(pageId);
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

  function startRename(file: (typeof data.files)[number]) {
    renameId = file.id;
    renameName = file.name;
    notice = '';
  }

  function startRenamePage(page: NonNullable<(typeof data.files)[number]['pages']>[number]) {
    renamePageId = page.id;
    renamePageSheetNumber = page.sheetNumber ?? `Page ${page.pageNumber}`;
    renamePageSheetTitle = page.sheetTitle ?? page.name;
    notice = '';
  }

  async function renameFile() {
    if (!renameId || !renameName.trim()) return;
    busy = true;
    notice = '';
    try {
      const response = await fetch(fileEndpoint(renameId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameName.trim() })
      });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Rename failed.');
      renameId = '';
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

  async function reindexFile(file: (typeof data.files)[number]) {
    const ok = confirm(`Re-index OCR for "${file.name}"? This will replace the detected sheet numbers and titles for this file.`);
    if (!ok) return;

    busy = true;
    notice = '';
    try {
      const response = await fetch(reindexEndpoint(file.id), { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'OCR re-index failed.');
      notice = result.ocrDeferred ? 'OCR is pending for this file.' : 'OCR re-indexed.';
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
      notice = `Deleted ${result.deleted ?? selectedPageIds.length} drawing page${(result.deleted ?? selectedPageIds.length) === 1 ? '' : 's'}.`;
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
          : 'View current drawings, revision status, published sets, and project downloads.'}
      </p>
    </div>
    <div class="tool-actions">
      {#if canUploadFiles}
        <FileUploadButton projectSlug={data.project.id} folderName={uploadFolder} />
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
        <select class="field compact" aria-label="Folder filter" bind:value={activeFolder}>
          <option>All files</option>
          {#each data.folders as folder}
            <option>{folder.name}</option>
          {/each}
        </select>
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
                {/if}
              </th>
              <th>{documentTool === 'specifications' ? 'Section' : 'Number'}</th>
              <th>{documentTool === 'specifications' ? 'Specification Title' : 'Drawing Title'}</th>
              <th>Revision</th>
              <th>{documentTool === 'specifications' ? 'Uploaded' : 'Drawing Date'}</th>
              <th>{documentTool === 'specifications' ? 'Folder' : 'Set'}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each groupedFiles as group}
              <tr class="group-row">
                <td><span class="group-caret">v</span></td>
                <td colspan="6">{group.name} ({group.files.length})</td>
              </tr>
              {#each group.files as file}
                <tr>
                  <td class="select-cell">
                    {#if documentTool === 'drawings' && file.pages?.length}
                      <input
                        type="checkbox"
                        aria-label={`Select all pages in ${file.name}`}
                        checked={filePagesSelected(file)}
                        onchange={(event) => toggleFilePages(file, event.currentTarget.checked)}
                      />
                    {/if}
                  </td>
                  <td>
                    {#if fileHasStorage(file) && fileIsPdf(file)}
                      <a class="record-link" href={viewerHref(file.id)}>{documentNumber(file)}</a>
                    {:else if fileHasStorage(file)}
                      <a class="record-link" href={`/api/files/${encodeURIComponent(file.id)}/download?download=1`}>{documentNumber(file)}</a>
                    {:else}
                      <span class="record-link muted-link">{documentNumber(file)}</span>
                    {/if}
                  </td>
                  <td>
                    {#if renameId === file.id}
                      <div class="inline-rename">
                        <input class="field min-h-9 py-2 text-sm" bind:value={renameName} aria-label="File name" />
                        <button class="icon-row-button primary" type="button" disabled={busy} onclick={renameFile} aria-label="Save file name">
                          <Check size={15} />
                        </button>
                        <button class="icon-row-button" type="button" disabled={busy} onclick={() => (renameId = '')} aria-label="Cancel rename">
                          <X size={15} />
                        </button>
                      </div>
                    {:else}
                      <span class="record-title">
                        <FileText size={14} />
                        <span>{documentTitle(file)}</span>
                      </span>
                    {/if}
                  </td>
                  <td>{revisionFor(file)}</td>
                  <td>{formatDate(file.updatedAt)}</td>
                  <td><span class="set-link">{file.path}</span></td>
                  <td>
                    <div class="row-actions">
                      <StatusPill label={statusFor(file)} />
                      {#if fileHasStorage(file)}
                        <a class="icon-row-button" href={`/api/files/${encodeURIComponent(file.id)}/download?download=1`} aria-label={`Download ${file.name}`}>
                          <Download size={15} />
                        </a>
                        <button class="icon-row-button" type="button" onclick={() => copyFileLink(file)} aria-label={`Copy link for ${file.name}`}>
                          <Copy size={15} />
                        </button>
                      {/if}
                      {#if canReindexFiles && !fileIsStorageOnly(file) && fileIsPdf(file)}
                        <button class="icon-row-button" type="button" disabled={busy} onclick={() => reindexFile(file)} aria-label={`Re-index OCR for ${file.name}`}>
                          <RefreshCw size={15} />
                        </button>
                      {/if}
                      {#if canModifyFiles && !fileIsStorageOnly(file)}
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
                {#if documentTool === 'drawings' && file.pages?.length}
                  {#each file.pages as pageRow}
                    <tr class="page-row" class:editing-row={renamePageId === pageRow.id}>
                      <td class="select-cell">
                        <input
                          type="checkbox"
                          aria-label={`Select ${pageRow.name}`}
                          checked={pageSelected(pageRow.id)}
                          onchange={(event) => togglePage(pageRow.id, event.currentTarget.checked)}
                        />
                      </td>
                      <td>
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
                            <span class="page-number">P{pageRow.pageNumber}</span>
                            <span>{pageRow.sheetTitle ?? pageRow.name}</span>
                          </span>
                        {/if}
                      </td>
                      <td>{pageRow.revision ?? revisionFor(file)}</td>
                      <td>{formatDate(file.updatedAt)}</td>
                      <td><span class="set-link">{file.name}</span></td>
                      <td>
                        <div class="row-actions">
                          <StatusPill label="Indexed" />
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
                {/if}
              {/each}
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

  .drawings-table {
    min-width: 0;
    table-layout: fixed;
  }

  .dense-table-shell {
    overflow: visible;
  }

  .select-col {
    width: 2.5rem;
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

  .inline-rename {
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) auto auto;
    align-items: center;
    gap: 0.35rem;
    max-width: 34rem;
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
    padding-left: 1.15rem;
    font-weight: 700;
  }

  .page-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    border-radius: 0.25rem;
    background: #eef1ed;
    color: #59615a;
    font-size: 0.68rem;
    font-weight: 850;
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
