<script lang="ts">
  import { page as appPage } from '$app/stores';
  import {
    ChevronLeft,
    ChevronRight,
    Download,
    FileText,
    Hand,
    Maximize2,
    Menu,
    MessageSquare,
    MousePointer2,
    PanelLeft,
    Search,
    X,
    ZoomIn,
    ZoomOut
  } from '@lucide/svelte';
  import EmbedPdfViewer from '$lib/components/EmbedPdfViewer.svelte';

  let { data } = $props();
  let showSheets = $state(false);
  const sheetCount = $derived(data.file.pages?.length || data.file.pageCount || 1);
  const activePage = $derived(clampPage(Number($appPage.url.searchParams.get('page') ?? '1')));
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

  function clampPage(value: number) {
    if (!Number.isFinite(value)) return 1;
    return Math.min(Math.max(1, Math.trunc(value)), Math.max(1, sheetCount));
  }

  function viewerPageHref(pageNumber: number) {
    const params = pageNumber > 1 ? `?page=${pageNumber}` : '';
    return `${data.backUrl}/${encodeURIComponent(data.file.id)}${params}`;
  }
</script>

<svelte:head>
  <title>{title} | Drawing Viewer</title>
</svelte:head>

<section class="viewer-page">
  <header class="viewer-topbar">
    <div class="viewer-left">
      <a class:disabled={activePage <= 1} class="nav-icon" href={viewerPageHref(previousPage)} aria-label="Previous sheet">
        <ChevronLeft size={18} />
      </a>
      <div class="sheet-pill">
        <strong>{sheetLabel}</strong>
        <span>{activePage} of {sheetCount}</span>
      </div>
      <span class="revision-pill">{data.file.revision ? `Rev ${data.file.revision}` : 'Current'}</span>
      <a class:disabled={activePage >= sheetCount} class="nav-icon" href={viewerPageHref(nextPage)} aria-label="Next sheet">
        <ChevronRight size={18} />
      </a>
    </div>
    <div class="viewer-right">
      <span>Read-only</span>
      <a class="top-icon" href={data.downloadUrl} aria-label="Download drawing">
        <Download size={16} />
      </a>
      <a class="exit-link" href={data.backUrl}>
        <X size={15} />
        Exit
      </a>
    </div>
  </header>

  <div class="viewer-toolrow">
    <button class="tool-icon" type="button" onclick={() => (showSheets = !showSheets)} aria-label="Toggle sheet index">
      <Menu size={18} />
    </button>
    <span class="tool-divider"></span>
    <button class="tool-icon" type="button" onclick={() => (showSheets = !showSheets)} aria-label="Sheet index">
      <PanelLeft size={18} />
    </button>
    <span class="tool-divider"></span>
    <button class="tool-icon ghosted" type="button" aria-label="Zoom out">
      <ZoomOut size={17} />
    </button>
    <span class="zoom-chip">Fit</span>
    <button class="tool-icon ghosted" type="button" aria-label="Zoom in">
      <ZoomIn size={17} />
    </button>
    <span class="tool-divider"></span>
    <button class="tool-icon active" type="button" aria-label="Pan">
      <Hand size={17} />
    </button>
    <button class="tool-icon" type="button" aria-label="Select">
      <MousePointer2 size={17} />
    </button>
    <nav class="viewer-tabs" aria-label="Drawing viewer tools">
      <span class="active">View</span>
      <span>Markup</span>
      <span>Shapes</span>
      <span>Insert</span>
    </nav>
    <div class="viewer-search">
      <Search size={18} />
      <MessageSquare size={18} />
      <a class="tool-icon" href={data.downloadSrc} target="_blank" rel="noreferrer" aria-label="Open in browser">
        <Maximize2 size={17} />
      </a>
    </div>
  </div>

  <div class:with-sheets={showSheets} class="viewer-body">
    {#if data.file.pages?.length && showSheets}
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
      <div class="viewer-file-title">
        <strong>{title}</strong>
      </div>
      {#key `${data.downloadSrc}:${activePage}`}
        <EmbedPdfViewer src={data.downloadSrc} title={title} page={activePage} />
      {/key}
    </div>
  </div>
</section>

<style>
  .viewer-page {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    min-height: calc(100dvh - 4.4rem);
    background: #eef0ef;
  }

  .viewer-topbar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
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
    grid-column: 3;
    justify-self: end;
    color: #d7dad7;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .nav-icon,
  .top-icon,
  .tool-icon {
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

  .sheet-pill span {
    color: #aeb4ae;
    font-weight: 800;
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

  .viewer-toolrow {
    display: flex;
    align-items: center;
    min-height: 3rem;
    gap: 0.35rem;
    border-bottom: 1px solid #d7dbd8;
    background: #fff;
    color: #121712;
    padding: 0.4rem 0.75rem;
  }

  .tool-icon {
    width: 2.15rem;
    height: 2.15rem;
    border: 1px solid transparent;
    border-radius: 0.35rem;
  }

  .tool-icon:hover,
  .tool-icon.active {
    border-color: #ff6a2a;
    color: #f15a24;
    background: #fff8f4;
  }

  .tool-icon.ghosted {
    color: #3f4540;
  }

  .tool-divider {
    width: 1px;
    height: 1.8rem;
    margin-inline: 0.25rem;
    background: #dde1de;
  }

  .zoom-chip {
    min-width: 4.2rem;
    border-radius: 0.3rem;
    background: #f5f6f4;
    padding: 0.46rem 0.65rem;
    color: #242824;
    font-size: 0.8rem;
    font-weight: 850;
    text-align: center;
  }

  .viewer-tabs {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(0.8rem, 2vw, 2.2rem);
    min-width: 0;
    flex: 1 1 auto;
    color: #202420;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .viewer-tabs span {
    display: inline-flex;
    align-items: center;
    min-height: 2.15rem;
    border-bottom: 2px solid transparent;
  }

  .viewer-tabs .active {
    color: #f15a24;
    border-color: #f15a24;
  }

  .viewer-search {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    margin-left: auto;
    color: #111712;
  }

  .viewer-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
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
    overflow: hidden;
    background: #dfe2e1;
  }

  .viewer-file-title {
    position: absolute;
    left: 1rem;
    top: 0.8rem;
    z-index: 2;
    max-width: min(42rem, calc(100% - 2rem));
    overflow: hidden;
    border: 1px solid rgba(25, 27, 25, 0.08);
    border-radius: 0.35rem;
    background: rgba(255, 255, 255, 0.9);
    padding: 0.42rem 0.62rem;
    color: #181c18;
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
    box-shadow: 0 14px 35px -30px rgba(0, 0, 0, 0.6);
  }

  @media (max-width: 900px) {
    .viewer-page {
      min-height: calc(100dvh - 4rem);
    }

    .viewer-topbar {
      grid-template-columns: minmax(0, 1fr);
    }

    .viewer-right {
      grid-column: auto;
      justify-self: stretch;
      justify-content: space-between;
    }

    .viewer-toolrow {
      overflow-x: auto;
    }

    .viewer-tabs {
      min-width: 18rem;
      justify-content: flex-start;
    }

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
