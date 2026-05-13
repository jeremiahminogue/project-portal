<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page as appPage } from '$app/stores';
  import {
    Check,
    ChevronLeft,
    ChevronRight,
    Download,
    FileText,
    Pencil,
    PanelLeft,
    X
  } from '@lucide/svelte';
  import EmbedPdfViewer from '$lib/components/EmbedPdfViewer.svelte';

  let { data } = $props();
  let showSheets = $state(false);
  let showTitleRegionTool = $state(false);
  let titleRegionSaving = $state(false);
  let titleRegionNotice = $state('');
  let editingSheetMeta = $state(false);
  let editSheetNumber = $state('');
  let editSheetTitle = $state('');
  let editSheetSaving = $state(false);
  let sheetMetaNotice = $state('');
  let titleRegion = $state<TitleBlockRegion | null>(null);
  let draftTitleRegion = $state<TitleBlockRegion | null>(null);
  let regionImage = $state<HTMLImageElement | null>(null);
  let selectingRegion = $state(false);
  let selectionStart = $state<{ x: number; y: number } | null>(null);

  type TitleBlockRegion = {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  const hasSheetIndex = $derived(Boolean(data.file.pages?.length));
  const sheetCount = $derived(data.file.pages?.length || 1);
  const activePage = $derived(hasSheetIndex ? clampPage(Number($appPage.url.searchParams.get('page') ?? '1')) : 1);
  const activeSheet = $derived(data.file.pages?.find((sheet) => sheet.pageNumber === activePage) ?? null);
  const activeSheetNumber = $derived(activeSheet?.sheetNumber ?? data.file.sheetNumber ?? `Sheet ${activePage}`);
  const activeSheetTitle = $derived(activeSheet?.sheetTitle ?? activeSheet?.name ?? data.file.sheetTitle ?? data.file.name);
  const activeRevision = $derived(activeSheet?.revision ?? data.file.revision);
  const title = $derived(
    activeSheet
      ? `${activeSheet.sheetNumber ?? `Page ${activeSheet.pageNumber}`} - ${activeSheet.sheetTitle ?? activeSheet.name}`
      : data.file.sheetNumber
        ? `${data.file.sheetNumber} - ${data.file.sheetTitle ?? data.file.name}`
        : data.file.name
  );
  const sheetLabel = $derived(activeSheet?.sheetNumber ?? data.file.sheetNumber ?? `Sheet ${activePage}`);
  const previousPage = $derived(Math.max(1, activePage - 1));
  const nextPage = $derived(Math.min(sheetCount, activePage + 1));
  const isPdf = $derived(/pdf/i.test(data.file.mimeType ?? '') || /\.pdf$/i.test(data.file.name));
  const isImage = $derived((data.file.mimeType ?? '').startsWith('image/'));
  const viewerSrc = $derived(isPdf && hasSheetIndex ? withQueryParam(data.downloadSrc, 'page', String(activePage)) : data.downloadSrc);
  const activeDownloadUrl = $derived(hasSheetIndex ? withQueryParam(data.downloadUrl, 'page', String(activePage)) : data.downloadUrl);
  const activeMarkupsUrl = $derived(hasSheetIndex && data.markupsUrl ? withQueryParam(data.markupsUrl, 'page', String(activePage)) : data.markupsUrl);
  const titleRegionImageSrc = $derived(`/api/files/${encodeURIComponent(data.file.id)}/page-image?page=${activePage}`);
  const titleRegionEndpoint = $derived(`/api/files/${encodeURIComponent(data.file.id)}/title-region`);
  const canEditTitleRegion = $derived(Boolean(data.fileAccess?.canModify && isPdf && !data.file.id.startsWith('storage:')));
  const canEditActiveSheet = $derived(Boolean(data.fileAccess?.canModify && isPdf && !data.file.id.startsWith('storage:')));

  $effect(() => {
    if (!showTitleRegionTool) {
      titleRegion = data.file.titleBlockRegion ?? null;
      draftTitleRegion = data.file.titleBlockRegion ?? null;
    }
  });

  function clampPage(value: number) {
    if (!Number.isFinite(value)) return 1;
    return Math.min(Math.max(1, Math.trunc(value)), Math.max(1, sheetCount));
  }

  function viewerPageHref(pageNumber: number) {
    const params = pageNumber > 1 ? `?page=${pageNumber}` : '';
    return `${data.backUrl}/${encodeURIComponent(data.file.id)}${params}`;
  }

  function withQueryParam(src: string, key: string, value: string) {
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }

  function fileEndpoint() {
    return `/api/files/${encodeURIComponent(data.file.id)}`;
  }

  function activePageEndpoint() {
    return activeSheet ? `/api/files/${encodeURIComponent(data.file.id)}/pages/${encodeURIComponent(activeSheet.id)}` : fileEndpoint();
  }

  function startEditSheetMeta() {
    editSheetNumber = activeSheetNumber;
    editSheetTitle = activeSheetTitle;
    sheetMetaNotice = '';
    editingSheetMeta = true;
  }

  function cancelEditSheetMeta() {
    editingSheetMeta = false;
    editSheetNumber = '';
    editSheetTitle = '';
    sheetMetaNotice = '';
  }

  async function saveSheetMeta() {
    if (!editSheetNumber.trim() && !editSheetTitle.trim()) {
      sheetMetaNotice = 'Add a sheet number or title before saving.';
      return;
    }

    editSheetSaving = true;
    sheetMetaNotice = '';
    try {
      const response = await fetch(activePageEndpoint(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetNumber: editSheetNumber.trim(),
          sheetTitle: editSheetTitle.trim()
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Sheet title could not be saved.');
      editingSheetMeta = false;
      await invalidateAll();
    } catch (reason) {
      sheetMetaNotice = reason instanceof Error ? reason.message : 'Sheet title could not be saved.';
    } finally {
      editSheetSaving = false;
    }
  }

  function clamp01(value: number) {
    return Math.min(Math.max(value, 0), 1);
  }

  function normalizedRegion(region: TitleBlockRegion | null) {
    if (!region) return null;
    const x1 = clamp01(region.x);
    const y1 = clamp01(region.y);
    const x2 = clamp01(region.x + region.width);
    const y2 = clamp01(region.y + region.height);
    const normalized = {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    };
    return normalized.width > 0.02 && normalized.height > 0.02 ? normalized : null;
  }

  function defaultTitleRegion() {
    return titleRegion ?? { x: 0.5, y: 0.62, width: 0.5, height: 0.38 };
  }

  function openTitleRegionTool() {
    draftTitleRegion = defaultTitleRegion();
    titleRegionNotice = '';
    showTitleRegionTool = true;
  }

  function regionPoint(event: PointerEvent) {
    const bounds = regionImage?.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: clamp01((event.clientX - bounds.left) / bounds.width),
      y: clamp01((event.clientY - bounds.top) / bounds.height)
    };
  }

  function beginRegionSelection(event: PointerEvent) {
    const point = regionPoint(event);
    if (!point) return;
    const target = event.currentTarget as HTMLElement | null;
    target?.setPointerCapture?.(event.pointerId);
    selectingRegion = true;
    selectionStart = point;
    draftTitleRegion = { x: point.x, y: point.y, width: 0.001, height: 0.001 };
  }

  function updateRegionSelection(event: PointerEvent) {
    if (!selectingRegion || !selectionStart) return;
    const point = regionPoint(event);
    if (!point) return;
    draftTitleRegion = {
      x: Math.min(selectionStart.x, point.x),
      y: Math.min(selectionStart.y, point.y),
      width: Math.abs(point.x - selectionStart.x),
      height: Math.abs(point.y - selectionStart.y)
    };
  }

  function endRegionSelection(event: PointerEvent) {
    if (!selectingRegion) return;
    const target = event.currentTarget as HTMLElement | null;
    target?.releasePointerCapture?.(event.pointerId);
    selectingRegion = false;
    selectionStart = null;
    draftTitleRegion = normalizedRegion(draftTitleRegion) ?? defaultTitleRegion();
  }

  function regionStyle(region: TitleBlockRegion | null) {
    const normalized = normalizedRegion(region);
    if (!normalized) return '';
    return `left:${normalized.x * 100}%;top:${normalized.y * 100}%;width:${normalized.width * 100}%;height:${normalized.height * 100}%;`;
  }

  async function saveTitleRegion() {
    const region = normalizedRegion(draftTitleRegion);
    if (!region) {
      titleRegionNotice = 'Draw a larger title area before saving.';
      return;
    }
    titleRegionSaving = true;
    titleRegionNotice = '';
    try {
      const saveResponse = await fetch(titleRegionEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region })
      });
      const saveResult = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) throw new Error(saveResult.error ?? 'Title area could not be saved.');
      titleRegion = region;
      draftTitleRegion = region;

      const ocrResponse = await fetch(`/api/files/${encodeURIComponent(data.file.id)}/reindex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, documentKind: 'drawing' })
      });
      const ocrResult = await ocrResponse.json().catch(() => ({}));
      if (!ocrResponse.ok) throw new Error(ocrResult.error ?? 'Title area saved, but OCR could not be re-run.');
      await invalidateAll();
      titleRegionNotice = ocrResult.ocrDeferred ? 'Title area saved. OCR will finish shortly.' : 'Title area saved and OCR updated.';
    } catch (reason) {
      titleRegionNotice = reason instanceof Error ? reason.message : 'Title area could not be saved.';
    } finally {
      titleRegionSaving = false;
    }
  }

  async function clearTitleRegion() {
    titleRegionSaving = true;
    titleRegionNotice = '';
    try {
      const response = await fetch(titleRegionEndpoint, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Title area could not be cleared.');
      titleRegion = null;
      draftTitleRegion = defaultTitleRegion();
      await invalidateAll();
      titleRegionNotice = 'Title area cleared.';
    } catch (reason) {
      titleRegionNotice = reason instanceof Error ? reason.message : 'Title area could not be cleared.';
    } finally {
      titleRegionSaving = false;
    }
  }
</script>

<svelte:head>
  <title>{title} | PDF Viewer</title>
</svelte:head>

<section class="viewer-page">
  <header class="viewer-topbar">
    <div class="viewer-left">
      {#if hasSheetIndex}
        <a class:disabled={activePage <= 1} class="nav-icon" href={viewerPageHref(previousPage)} aria-label="Previous sheet">
          <ChevronLeft size={18} />
        </a>
        <button class:active={showSheets} class="nav-icon" type="button" onclick={() => (showSheets = !showSheets)} aria-label="Toggle sheet index">
          <PanelLeft size={18} />
        </button>
        <div class="sheet-pill">
          <strong>Page {activePage}</strong>
          <span>of {sheetCount}</span>
        </div>
        <div class="viewer-title">
          {#if editingSheetMeta}
            <form
              class="viewer-title-edit"
              onsubmit={(event) => {
                event.preventDefault();
                void saveSheetMeta();
              }}
            >
              <input class="viewer-title-number" bind:value={editSheetNumber} disabled={editSheetSaving} aria-label="Sheet number" />
              <input class="viewer-title-name" bind:value={editSheetTitle} disabled={editSheetSaving} aria-label="Sheet title" />
              <button class="title-icon success" type="submit" disabled={editSheetSaving || (!editSheetNumber.trim() && !editSheetTitle.trim())} aria-label="Save sheet title">
                <Check size={14} />
              </button>
              <button class="title-icon" type="button" disabled={editSheetSaving} onclick={cancelEditSheetMeta} aria-label="Cancel sheet title edit">
                <X size={14} />
              </button>
            </form>
          {:else}
            <button class="viewer-title-button" type="button" disabled={!canEditActiveSheet} onclick={startEditSheetMeta} aria-label="Edit sheet number and title">
              <strong>{activeSheetNumber}</strong>
              <span>{activeSheetTitle}</span>
              {#if canEditActiveSheet}
                <Pencil size={13} />
              {/if}
            </button>
          {/if}
          {#if sheetMetaNotice}
            <small>{sheetMetaNotice}</small>
          {/if}
        </div>
        <span class="revision-pill">{activeRevision ? `Rev ${activeRevision}` : 'Current'}</span>
        <a class:disabled={activePage >= sheetCount} class="nav-icon" href={viewerPageHref(nextPage)} aria-label="Next sheet">
          <ChevronRight size={18} />
        </a>
      {:else}
        <div class="sheet-pill document-pill">
          <FileText size={15} />
          <strong>{data.file.name}</strong>
        </div>
        {#if isPdf}
          <div class="viewer-title">
            {#if editingSheetMeta}
              <form
                class="viewer-title-edit"
                onsubmit={(event) => {
                  event.preventDefault();
                  void saveSheetMeta();
                }}
              >
                <input class="viewer-title-number" bind:value={editSheetNumber} disabled={editSheetSaving} aria-label="Sheet number" />
                <input class="viewer-title-name" bind:value={editSheetTitle} disabled={editSheetSaving} aria-label="Sheet title" />
                <button class="title-icon success" type="submit" disabled={editSheetSaving || (!editSheetNumber.trim() && !editSheetTitle.trim())} aria-label="Save sheet title">
                  <Check size={14} />
                </button>
                <button class="title-icon" type="button" disabled={editSheetSaving} onclick={cancelEditSheetMeta} aria-label="Cancel sheet title edit">
                  <X size={14} />
                </button>
              </form>
            {:else}
              <button class="viewer-title-button" type="button" disabled={!canEditActiveSheet} onclick={startEditSheetMeta} aria-label="Edit sheet number and title">
                <strong>{activeSheetNumber}</strong>
                <span>{activeSheetTitle}</span>
                {#if canEditActiveSheet}
                  <Pencil size={13} />
                {/if}
              </button>
            {/if}
            {#if sheetMetaNotice}
              <small>{sheetMetaNotice}</small>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
    <div class="viewer-right">
      {#if canEditTitleRegion}
        <button class:active={showTitleRegionTool} class="top-action" type="button" onclick={openTitleRegionTool}>
          <Pencil size={14} />
          Title area
        </button>
      {/if}
      {#if data.fileAccess?.canModify}
        <span class="markup-status"><Pencil size={14} /> Markup enabled</span>
      {/if}
      <a class="top-icon" href={activeDownloadUrl} aria-label="Download original PDF" title="Download original">
        <Download size={16} />
      </a>
      <a class="exit-link" href={data.backUrl}>
        <X size={15} />
        Exit
      </a>
    </div>
  </header>

  <div class:with-sheets={showSheets && hasSheetIndex} class="viewer-body">
    {#if hasSheetIndex && showSheets}
      <aside class="sheet-index" aria-label="Sheet index">
        <div class="sheet-index-title">Sheets</div>
        {#each data.file.pages as page}
          <a class:active={page.pageNumber === activePage} class="sheet-row" href={viewerPageHref(page.pageNumber)}>
            <FileText size={14} />
            <span>
              <strong>{page.sheetNumber ?? `Page ${page.pageNumber}`}</strong>
              <small>{page.sheetTitle ?? page.name}</small>
            </span>
          </a>
        {/each}
      </aside>
    {/if}
    <div class="viewer-frame">
      {#if isPdf}
        {#key viewerSrc}
          <EmbedPdfViewer
            src={viewerSrc}
            title={title}
            page={activePage}
            markupsUrl={activeMarkupsUrl}
            editable={Boolean(data.fileAccess?.canModify)}
            originalDownloadUrl={activeDownloadUrl}
          />
        {/key}
      {:else if isImage}
        <div class="image-preview">
          <img src={data.downloadSrc} alt={title} />
        </div>
      {:else}
        <div class="viewer-error">
          <strong>Preview is not available for this file type</strong>
          <span>{data.file.name}</span>
          <a class="btn btn-primary" href={data.downloadUrl}>Download file</a>
        </div>
      {/if}
    </div>
  </div>

  {#if showTitleRegionTool}
    <div
      class="region-modal-backdrop"
      role="presentation"
      onclick={(event) => {
        if (event.target === event.currentTarget) showTitleRegionTool = false;
      }}
    >
      <div class="region-modal" role="dialog" aria-modal="true" aria-labelledby="title-region-heading">
        <header class="region-modal-header">
          <div>
            <strong id="title-region-heading">Title area</strong>
            <span>{sheetLabel}</span>
          </div>
          <button class="region-close" type="button" onclick={() => (showTitleRegionTool = false)} aria-label="Close title area selector">
            <X size={16} />
          </button>
        </header>
        <div class="region-preview">
          <div
            class="region-canvas"
            role="presentation"
            onpointerdown={beginRegionSelection}
            onpointermove={updateRegionSelection}
            onpointerup={endRegionSelection}
            onpointercancel={endRegionSelection}
          >
            {#key titleRegionImageSrc}
              <img bind:this={regionImage} src={titleRegionImageSrc} alt={`${title} page preview`} draggable="false" />
            {/key}
            {#if normalizedRegion(draftTitleRegion)}
              <div class="region-box" style={regionStyle(draftTitleRegion)}></div>
            {/if}
          </div>
        </div>
        {#if titleRegionNotice}
          <div class="region-notice">{titleRegionNotice}</div>
        {/if}
        <footer class="region-actions">
          <button class="region-button" type="button" disabled={titleRegionSaving} onclick={() => (draftTitleRegion = defaultTitleRegion())}>Reset</button>
          <button class="region-button" type="button" disabled={titleRegionSaving || !titleRegion} onclick={clearTitleRegion}>Clear</button>
          <button class="region-button primary" type="button" disabled={titleRegionSaving || !normalizedRegion(draftTitleRegion)} onclick={saveTitleRegion}>
            {titleRegionSaving ? 'Working...' : 'Save and OCR'}
          </button>
        </footer>
      </div>
    </div>
  {/if}
</section>

<style>
  .viewer-page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100dvh;
    overflow: hidden;
    background: #eef0ef;
  }

  .viewer-topbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    background: #111312;
    color: #fff;
    padding: 0.55rem 0.8rem;
  }

  .viewer-left,
  .viewer-right {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .viewer-right {
    justify-self: end;
    color: #d7dad7;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .nav-icon,
  .top-icon,
  .top-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: inherit;
  }

  .nav-icon,
  .top-icon {
    width: 1.9rem;
    height: 1.9rem;
    border-radius: 0.25rem;
    color: #eef0ee;
  }

  .nav-icon:hover,
  .nav-icon.active,
  .top-action:hover,
  .top-action.active,
  .top-icon:hover,
  .exit-link:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .top-action {
    gap: 0.3rem;
    min-height: 1.9rem;
    border-radius: 0.25rem;
    padding: 0.32rem 0.55rem;
    color: #f4f6f4;
    font-size: 0.76rem;
    font-weight: 900;
  }

  .nav-icon.disabled {
    pointer-events: none;
    opacity: 0.35;
  }

  .sheet-pill,
  .revision-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1.75rem;
    border-radius: 0.35rem;
    padding: 0.25rem 0.6rem;
    font-size: 0.82rem;
    font-weight: 900;
  }

  .sheet-pill {
    background: #222422;
  }

  .document-pill {
    max-width: min(44rem, 62vw);
  }

  .document-pill strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sheet-pill span {
    color: #aeb4ae;
    font-weight: 800;
  }

  .markup-status {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    color: #bfe7c7;
  }

  .revision-pill {
    background: #4a2418;
    color: #ffb18f;
  }

  .viewer-title {
    display: grid;
    gap: 0.15rem;
    min-width: min(24rem, 34vw);
    max-width: min(42rem, 48vw);
  }

  .viewer-title-button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.45rem;
    min-height: 1.9rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.3rem;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.28rem 0.5rem;
    color: #fff;
    text-align: left;
  }

  .viewer-title-button:disabled {
    cursor: default;
    opacity: 1;
  }

  .viewer-title-button:not(:disabled):hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .viewer-title-button strong,
  .viewer-title-button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .viewer-title-button strong {
    color: #f7fbf7;
    font-size: 0.78rem;
    font-weight: 950;
  }

  .viewer-title-button span {
    color: #d9ded9;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .viewer-title small {
    color: #ffcfbd;
    font-size: 0.68rem;
    font-weight: 850;
  }

  .viewer-title-edit {
    display: grid;
    grid-template-columns: minmax(5rem, 7rem) minmax(9rem, 1fr) auto auto;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }

  .viewer-title-edit input {
    min-width: 0;
    min-height: 1.9rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.28rem;
    background: #fff;
    padding: 0.28rem 0.42rem;
    color: #191b19;
    font-size: 0.76rem;
    font-weight: 850;
  }

  .title-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.9rem;
    height: 1.9rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 0.28rem;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
  }

  .title-icon.success {
    border-color: rgba(24, 165, 58, 0.45);
    background: #18a53a;
  }

  .title-icon:disabled {
    cursor: wait;
    opacity: 0.58;
  }

  .exit-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border-radius: 0.25rem;
    padding: 0.42rem 0.45rem;
    color: #fff;
    font-size: 0.78rem;
    font-weight: 900;
  }

  .viewer-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .viewer-body.with-sheets {
    grid-template-columns: minmax(230px, 285px) minmax(0, 1fr);
  }

  .sheet-index {
    min-height: 0;
    overflow: auto;
    border-right: 1px solid rgba(25, 27, 25, 0.12);
    background: #fff;
    padding: 0.75rem;
  }

  .sheet-index-title {
    margin-bottom: 0.45rem;
    color: #171917;
    font-size: 0.9rem;
    font-weight: 900;
  }

  .sheet-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 0.45rem;
    border-radius: 0.35rem;
    padding: 0.55rem;
    color: #2f3530;
  }

  .sheet-row:hover {
    background: #f1f5f1;
  }

  .sheet-row.active {
    background: #eef8f0;
    box-shadow: inset 3px 0 0 #18a53a;
  }

  .sheet-row span,
  .sheet-row small {
    min-width: 0;
  }

  .sheet-row strong,
  .sheet-row small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sheet-row strong {
    color: #191b19;
    font-size: 0.78rem;
    font-weight: 900;
  }

  .sheet-row small {
    margin-top: 0.1rem;
    color: #687068;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .viewer-frame {
    position: relative;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: auto;
    background: #dfe2e1;
  }

  .image-preview {
    display: grid;
    min-height: 100%;
    place-items: center;
    padding: 1rem;
  }

  .image-preview img {
    max-width: 100%;
    max-height: calc(100dvh - 5rem);
    border-radius: 0.4rem;
    background: #fff;
    box-shadow: 0 16px 42px rgba(20, 22, 20, 0.18);
  }

  .viewer-error {
    display: grid;
    height: 100%;
    min-height: 24rem;
    align-content: center;
    justify-items: center;
    gap: 0.6rem;
    padding: 2rem;
    background: #f8f9f7;
    color: #4b514c;
    text-align: center;
  }

  .viewer-error strong {
    color: #191b19;
    font-size: 1.1rem;
  }

  .region-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    background: rgba(17, 19, 18, 0.72);
    padding: 1.2rem;
  }

  .region-modal {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    width: min(72rem, 96vw);
    max-height: min(52rem, 94vh);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 0.45rem;
    background: #161817;
    color: #fff;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
  }

  .region-modal-header,
  .region-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.85rem;
  }

  .region-modal-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .region-modal-header div {
    display: grid;
    gap: 0.1rem;
  }

  .region-modal-header strong {
    font-size: 0.95rem;
    font-weight: 950;
  }

  .region-modal-header span {
    color: #b8beb8;
    font-size: 0.74rem;
    font-weight: 850;
  }

  .region-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 0;
    border-radius: 0.25rem;
    background: transparent;
    color: #fff;
  }

  .region-close:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .region-preview {
    min-height: 0;
    overflow: auto;
    background: #2b2d2b;
  }

  .region-canvas {
    position: relative;
    width: 100%;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }

  .region-preview img {
    display: block;
    width: 100%;
    height: auto;
    pointer-events: none;
  }

  .region-box {
    position: absolute;
    border: 2px solid #ff6a2a;
    background: rgba(255, 106, 42, 0.18);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.85),
      0 8px 22px rgba(0, 0, 0, 0.22);
    pointer-events: none;
  }

  .region-notice {
    margin: 0.65rem 0.85rem 0;
    border-radius: 0.3rem;
    background: rgba(255, 255, 255, 0.1);
    padding: 0.5rem 0.65rem;
    color: #f4f6f4;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .region-actions {
    justify-content: flex-end;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .region-button {
    min-height: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 0.3rem;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.35rem 0.65rem;
    color: #fff;
    font-size: 0.76rem;
    font-weight: 900;
  }

  .region-button.primary {
    border-color: rgba(255, 106, 42, 0.5);
    background: #ff6a2a;
    color: #171917;
  }

  .region-button:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  @media (max-width: 900px) {
    .viewer-body,
    .viewer-body.with-sheets {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
    }

    .sheet-index {
      display: flex;
      gap: 0.4rem;
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid rgba(25, 27, 25, 0.12);
    }

    .sheet-index-title {
      display: none;
    }

    .sheet-row {
      min-width: 12rem;
    }

    .viewer-topbar {
      grid-template-columns: 1fr;
    }

    .viewer-right {
      justify-self: start;
    }

    .viewer-title {
      min-width: min(24rem, 70vw);
      max-width: 100%;
    }
  }
</style>
