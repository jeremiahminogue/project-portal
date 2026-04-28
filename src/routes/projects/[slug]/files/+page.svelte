<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    Check,
    Copy,
    Download,
    FileText,
    Folder,
    FolderPlus,
    Grid2X2,
    ListFilter,
    Pencil,
    RefreshCw,
    Rows3,
    Search,
    Trash2,
    X
  } from '@lucide/svelte';
  import FileUploadButton from '$lib/components/FileUploadButton.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  let { data, form } = $props();
  let query = $state('');
  let activeFolder = $state('All files');
  let showFolderForm = $state(false);
  let renameId = $state('');
  let renameName = $state('');
  let renamePageId = $state('');
  let renamePageSheetNumber = $state('');
  let renamePageSheetTitle = $state('');
  let busy = $state(false);
  let notice = $state('');

  const documentTool = $derived($page.url.searchParams.get('tool') === 'specifications' ? 'specifications' : 'drawings');
  const toolTitle = $derived(documentTool === 'specifications' ? 'Specifications' : 'Drawings');
  const canModifyFiles = $derived(Boolean(data.fileAccess?.canModify));
  const canDeleteFiles = $derived(Boolean(data.fileAccess?.canDelete));
  const uploadFolder = $derived(activeFolder === 'All files' ? '' : activeFolder);

  const toolFiles = $derived(data.files.filter((file) => (documentTool === 'specifications' ? isSpecification(file) : !isSpecification(file))));
  const filteredFiles = $derived(
    toolFiles.filter((file) => {
      const folderOk = activeFolder === 'All files' || file.path.startsWith(`${activeFolder}/`);
      const queryOk = !query || `${file.name} ${file.path} ${file.tags?.join(' ') ?? ''}`.toLowerCase().includes(query.toLowerCase());
      return folderOk && queryOk;
    })
  );
  const folderViews = $derived(
    data.folders.map((folder) => ({
      ...folder,
      fileCount: toolFiles.filter((file) => file.path.startsWith(`${folder.name}/`)).length
    }))
  );
  const groupedFiles = $derived(
    [...new Set(filteredFiles.map((file) => folderName(file)))]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        files: filteredFiles.filter((file) => folderName(file) === name)
      }))
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
      <div class="tool-tabs" aria-label="Document tools">
        <a class:active={documentTool === 'drawings'} href={`/projects/${data.project.id}/files`}>Drawings</a>
        <a class:active={documentTool === 'specifications'} href={`/projects/${data.project.id}/files?tool=specifications`}>Specifications</a>
      </div>
    </div>
    <div class="tool-actions">
      {#if canModifyFiles}
        <button class="btn btn-secondary" type="button" onclick={() => (showFolderForm = !showFolderForm)}>
          <FolderPlus size={16} />
          New folder
        </button>
        <div class="upload-action">
          <FileUploadButton projectSlug={data.project.id} folderName={uploadFolder} />
          <span>Target: {uploadFolder || 'Root'}</span>
        </div>
      {:else}
        <span class="readonly-chip">Read-only access</span>
      {/if}
    </div>
  </section>

  {#if form?.error}
    <div class="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>
  {/if}
  {#if notice}
    <div class="mb-3 rounded-md border border-black/10 bg-white px-3 py-2 text-sm font-semibold text-pe-sub">{notice}</div>
  {/if}

  {#if showFolderForm && canModifyFiles}
    <form class="utility-panel mb-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" method="post" action="?/createFolder" use:enhance>
      <div>
        <label class="label" for="folder-name">Folder name</label>
        <input id="folder-name" class="field" name="name" placeholder="Drawings, Specifications, Closeout..." required />
      </div>
      <div class="flex items-end">
        <button class="btn btn-primary w-full sm:w-auto" type="submit">
          <FolderPlus size={16} />
          Create folder
        </button>
      </div>
    </form>
  {/if}

  <section class="workbench documents-workbench">
    <aside class="saved-views">
      <div class="views-title">Views</div>
      <button class={`view-row ${activeFolder === 'All files' ? 'active' : ''}`} type="button" onclick={() => (activeFolder = 'All files')}>
        <Folder size={15} />
        <span>All {toolTitle}</span>
        <strong>{toolFiles.length}</strong>
      </button>
      {#each folderViews as folder}
        <button class={`view-row ${activeFolder === folder.name ? 'active' : ''}`} type="button" onclick={() => (activeFolder = folder.name)}>
          <Folder size={15} />
          <span>{folder.name}</span>
          <strong>{folder.fileCount}</strong>
        </button>
      {/each}
    </aside>

    <div class="log-area">
      <div class="log-toolbar">
        <div class="searchbox">
          <Search size={16} />
          <input bind:value={query} placeholder="Search" />
        </div>
        <button class="filter-button" type="button">
          <ListFilter size={14} />
          Filters
        </button>
        <select class="field compact" aria-label="Folder filter" bind:value={activeFolder}>
          <option>All files</option>
          {#each data.folders as folder}
            <option>{folder.name}</option>
          {/each}
        </select>
        <select class="field compact" aria-label="Set filter">
          <option>Current set</option>
          <option>All sets</option>
        </select>
        <span class="result-count">{filteredFiles.length} shown</span>
        <div class="view-toggle" aria-label="View mode">
          <button class="active" type="button" aria-label="List view"><Rows3 size={16} /></button>
          <button type="button" aria-label="Grid view"><Grid2X2 size={16} /></button>
        </div>
      </div>

      <div class="dense-table-shell">
        <table class="dense-table drawings-table">
          <thead>
            <tr>
              <th class="w-10"><input type="checkbox" aria-label={`Select all ${toolTitle}`} /></th>
              <th>{documentTool === 'specifications' ? 'Section' : 'Number'}</th>
              <th>{documentTool === 'specifications' ? 'Specification Title' : 'Drawing Title'}</th>
              <th>Revision</th>
              <th>{documentTool === 'specifications' ? 'Uploaded' : 'Drawing Date'}</th>
              <th>Received Date</th>
              <th>{documentTool === 'specifications' ? 'Folder' : 'Set'}</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each groupedFiles as group}
              <tr class="group-row">
                <td><span class="group-caret">v</span></td>
                <td colspan="8">{group.name} ({group.files.length})</td>
              </tr>
              {#each group.files as file}
                <tr>
                  <td><input type="checkbox" aria-label={`Select ${file.name}`} /></td>
                  <td>
                    {#if fileHasStorage(file)}
                      <a class="record-link" href={viewerHref(file.id)}>{documentNumber(file)}</a>
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
                  <td>{formatDate(file.updatedAt)}</td>
                  <td><span class="set-link">{file.path}</span></td>
                  <td><StatusPill label={statusFor(file)} /></td>
                  <td>
                    <div class="row-actions">
                      {#if fileHasStorage(file)}
                        <a class="icon-row-button" href={`/api/files/${encodeURIComponent(file.id)}/download?download=1`} aria-label={`Download ${file.name}`}>
                          <Download size={15} />
                        </a>
                        <button class="icon-row-button" type="button" onclick={() => copyFileLink(file)} aria-label={`Copy link for ${file.name}`}>
                          <Copy size={15} />
                        </button>
                      {/if}
                      {#if canModifyFiles && !fileIsStorageOnly(file)}
                        <button class="icon-row-button" type="button" disabled={busy} onclick={() => reindexFile(file)} aria-label={`Re-index OCR for ${file.name}`}>
                          <RefreshCw size={15} />
                        </button>
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
                      <td></td>
                      <td>
                        {#if renamePageId === pageRow.id}
                          <input class="field sheet-edit-number" bind:value={renamePageSheetNumber} aria-label="Sheet number" />
                        {:else if fileHasStorage(file)}
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
                      <td>{formatDate(file.updatedAt)}</td>
                      <td><span class="set-link">{file.name}</span></td>
                      <td><StatusPill label="Indexed" /></td>
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
                <td colspan="9">
                  <div class="empty-log">
                    <strong>No {toolTitle.toLowerCase()} match this view.</strong>
                    <span>Upload into {uploadFolder || 'Root'}, or adjust search and filters.</span>
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
    grid-template-columns: 230px minmax(0, 1fr);
  }

  .drawings-table {
    min-width: 1120px;
  }

  .record-title {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    max-width: 34rem;
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
    max-width: 18rem;
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

  .page-rename {
    margin-left: 1.15rem;
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

  @media (max-width: 900px) {
    .documents-workbench {
      grid-template-columns: 1fr;
    }
  }
</style>
