<script lang="ts">
  import { page as appPage } from '$app/stores';
  import {
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
  const hasSheetIndex = $derived(Boolean(data.file.pages?.length));
  const sheetCount = $derived(data.file.pages?.length || 1);
  const activePage = $derived(hasSheetIndex ? clampPage(Number($appPage.url.searchParams.get('page') ?? '1')) : 1);
  const activeSheet = $derived(data.file.pages?.find((sheet) => sheet.pageNumber === activePage) ?? null);
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
          <strong>{sheetLabel}</strong>
          <span>{activePage} of {sheetCount}</span>
        </div>
        <span class="revision-pill">{data.file.revision ? `Rev ${data.file.revision}` : 'Current'}</span>
        <a class:disabled={activePage >= sheetCount} class="nav-icon" href={viewerPageHref(nextPage)} aria-label="Next sheet">
          <ChevronRight size={18} />
        </a>
      {:else}
        <div class="sheet-pill document-pill">
          <FileText size={15} />
          <strong>{data.file.name}</strong>
        </div>
      {/if}
    </div>
    <div class="viewer-right">
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
  }

  .viewer-right {
    justify-self: end;
    color: #d7dad7;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .nav-icon,
  .top-icon {
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
  .top-icon:hover,
  .exit-link:hover {
    background: rgba(255, 255, 255, 0.1);
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
  }
</style>
