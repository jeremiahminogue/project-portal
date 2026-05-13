<script lang="ts">
  import { onMount } from 'svelte';
  import { Download, Save } from '@lucide/svelte';

  let {
    src,
    title,
    page = 1,
    markupsUrl = '',
    editable = false,
    originalDownloadUrl = ''
  }: {
    src: string;
    title: string;
    page?: number;
    markupsUrl?: string;
    editable?: boolean;
    originalDownloadUrl?: string;
  } = $props();

  let target = $state<HTMLDivElement | null>(null);
  let error = $state('');
  let notice = $state('');
  let saving = $state(false);
  let downloading = $state(false);
  let annotationCapability = $state<AnnotationCapability | null>(null);
  let exportCapability = $state<ExportCapability | null>(null);

  type AnnotationCapability = {
    importAnnotations?: (items: unknown[]) => void;
    exportAnnotations?: () => { toPromise?: () => Promise<unknown[]> };
    commit?: () => { toPromise?: () => Promise<boolean> };
  };

  type ExportCapability = {
    saveAsCopy?: () => { toPromise?: () => Promise<ArrayBuffer> };
  };

  function bytesToBase64(bytes: Uint8Array) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToBytes(value: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function encodeMarkupValue(value: unknown): unknown {
    if (value instanceof ArrayBuffer) {
      return { __portalMarkupType: 'ArrayBuffer', base64: bytesToBase64(new Uint8Array(value)) };
    }
    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      return { __portalMarkupType: 'Uint8Array', base64: bytesToBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) };
    }
    if (Array.isArray(value)) return value.map(encodeMarkupValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, encodeMarkupValue(nested)]));
    }
    return value;
  }

  function decodeMarkupValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(decodeMarkupValue);
    if (value && typeof value === 'object') {
      const candidate = value as { __portalMarkupType?: string; base64?: string };
      if (typeof candidate.base64 === 'string' && candidate.__portalMarkupType === 'ArrayBuffer') {
        return base64ToBytes(candidate.base64).buffer;
      }
      if (typeof candidate.base64 === 'string' && candidate.__portalMarkupType === 'Uint8Array') {
        return base64ToBytes(candidate.base64);
      }
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, decodeMarkupValue(nested)]));
    }
    return value;
  }

  async function loadSavedMarkups(annotation: AnnotationCapability | null) {
    if (!annotation?.importAnnotations || !markupsUrl) return;
    const response = await fetch(markupsUrl, { credentials: 'same-origin' });
    if (!response.ok) return;
    const result = await response.json().catch(() => null);
    const annotations = Array.isArray(result?.annotations) ? result.annotations : [];
    if (!annotations.length) return;
    annotation.importAnnotations(decodeMarkupValue(annotations) as unknown[]);
    await annotation.commit?.().toPromise?.();
  }

  onMount(() => {
    let viewer:
      | (HTMLElement & {
          registry?: Promise<{
            pluginsReady?: () => Promise<void>;
            getPlugin?: (id: string) => { provides?: () => unknown } | null;
          }>;
        })
      | undefined;
    let cancelled = false;
    const cleanup: Array<() => void> = [];

    function scrollToInitialPage(scroll: unknown, totalPages?: number) {
      const scrollCapability = scroll as { scrollToPage?: (options: { pageNumber: number; behavior?: 'instant' | 'smooth'; alignY?: number }) => void };
      if (!scrollCapability.scrollToPage || !totalPages) return;
      const targetPage = Math.min(Math.max(1, page), Math.max(1, totalPages ?? page));
      scrollCapability.scrollToPage({ pageNumber: targetPage, behavior: 'instant', alignY: 0 });
    }

    function queueInitialScroll(scroll: unknown, totalPages?: number) {
      if (!totalPages) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) scrollToInitialPage(scroll, totalPages);
        });
      });
    }

    async function pdfReadinessError(response: Response) {
      const body = await response.clone().json().catch(() => null);
      if (body && typeof body.error === 'string') return body.error;
      const text = await response.text().catch(() => '');
      return text || `PDF request failed with status ${response.status}.`;
    }

    async function assertPdfReadable() {
      const response = await fetch(src, {
        credentials: 'same-origin',
        headers: {
          Range: 'bytes=0-0'
        }
      });
      if (!response.ok) throw new Error(await pdfReadinessError(response));
    }

    async function mountViewer() {
      try {
        await assertPdfReadable();
        const { default: EmbedPDF, ZoomMode } = await import('@embedpdf/snippet');
        if (cancelled || !target) return;

        viewer = EmbedPDF.init({
          type: 'container',
          target,
          worker: false,
          wasmUrl: '/embedpdf/pdfium.wasm',
          permissions: {
            enforceDocumentPermissions: false
          },
          documentManager: {
            initialDocuments: [
              {
                url: src,
                name: title,
                mode: 'full-fetch',
                autoActivate: true,
                requestOptions: {
                  credentials: 'same-origin'
                }
              }
            ]
          },
          zoom: {
            defaultZoomLevel: ZoomMode.FitWidth
          },
          theme: {
            preference: 'light'
          }
        }) as typeof viewer;

        const registry = await viewer?.registry;
        if (cancelled || !registry) return;
        await registry.pluginsReady?.();
        annotationCapability = (registry.getPlugin?.('annotation')?.provides?.() as AnnotationCapability | null) ?? null;
        exportCapability = (registry.getPlugin?.('export')?.provides?.() as ExportCapability | null) ?? null;
        await loadSavedMarkups(annotationCapability);
        const scroll = registry.getPlugin?.('scroll')?.provides?.();
        const scrollEvents = scroll as {
          getTotalPages?: () => number;
          onLayoutReady?: (listener: (event: { totalPages: number }) => void) => () => void;
        };

        const unsubscribe = scrollEvents.onLayoutReady?.((event) => {
          if (!cancelled) queueInitialScroll(scroll, event.totalPages);
        });
        if (unsubscribe) cleanup.push(unsubscribe);
        queueInitialScroll(scroll, scrollEvents.getTotalPages?.());
      } catch (reason) {
        error = reason instanceof Error ? reason.message : 'Could not load PDF viewer.';
      }
    }

    void mountViewer();

    return () => {
      cancelled = true;
      for (const dispose of cleanup.splice(0)) dispose();
      viewer?.remove();
      if (target) target.innerHTML = '';
    };
  });

  async function saveMarkups() {
    if (!annotationCapability?.exportAnnotations || !markupsUrl) return;
    saving = true;
    notice = '';
    try {
      await annotationCapability.commit?.().toPromise?.();
      const annotations = await annotationCapability.exportAnnotations().toPromise?.();
      const response = await fetch(markupsUrl, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: encodeMarkupValue(annotations ?? []) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? 'Could not save markups.');
      notice = 'Markups saved.';
    } catch (reason) {
      notice = reason instanceof Error ? reason.message : 'Could not save markups.';
    } finally {
      saving = false;
    }
  }

  async function downloadWithMarkups() {
    if (!exportCapability?.saveAsCopy) return;
    downloading = true;
    notice = '';
    try {
      await annotationCapability?.commit?.().toPromise?.();
      const buffer = await exportCapability.saveAsCopy().toPromise?.();
      if (!buffer) throw new Error('Could not prepare the marked-up PDF.');
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const baseName = title.replace(/[\\/:*?"<>|]+/g, '-').replace(/\.pdf$/i, '').trim() || 'marked-up-document';
      link.href = url;
      link.download = `${baseName} - marked up.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      notice = reason instanceof Error ? reason.message : 'Could not download the marked-up PDF.';
    } finally {
      downloading = false;
    }
  }
</script>

{#if error}
  <div class="viewer-error">
    <strong>Viewer failed to load</strong>
    <span>{error}</span>
    <a class="btn btn-primary" href={src} target="_blank" rel="noreferrer">Open PDF</a>
  </div>
{:else}
  <div class="embedpdf-shell">
    <div class="markup-actions" aria-label="PDF markup actions">
      {#if originalDownloadUrl}
        <a class="markup-button" href={originalDownloadUrl} title="Download original PDF">
          <Download size={14} />
          Original
        </a>
      {/if}
      <button class="markup-button" type="button" disabled={!exportCapability || downloading} onclick={downloadWithMarkups} title="Download PDF with markups">
        <Download size={14} />
        {downloading ? 'Preparing...' : 'With markups'}
      </button>
      {#if editable && markupsUrl}
        <button class="markup-button primary" type="button" disabled={!annotationCapability || saving} onclick={saveMarkups} title="Save markups to this project">
          <Save size={14} />
          {saving ? 'Saving...' : 'Save markups'}
        </button>
      {/if}
    </div>
    {#if notice}
      <div class="markup-notice">{notice}</div>
    {/if}
    <div bind:this={target} class="embedpdf-target" aria-label={`PDF viewer for ${title}`}></div>
  </div>
{/if}

<style>
  .embedpdf-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .markup-actions {
    position: absolute;
    z-index: 2;
    bottom: 0.85rem;
    right: 0.85rem;
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.4rem;
    max-width: min(34rem, calc(100% - 1.7rem));
  }

  .markup-button {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 0.3rem;
    background: rgba(17, 19, 18, 0.86);
    padding: 0.35rem 0.55rem;
    color: #fff;
    font-size: 0.74rem;
    font-weight: 900;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  }

  .markup-button.primary {
    border-color: rgba(51, 193, 88, 0.35);
    background: #187a32;
  }

  .markup-button:disabled {
    cursor: wait;
    opacity: 0.58;
  }

  .markup-notice {
    position: absolute;
    z-index: 2;
    bottom: 3.35rem;
    right: 0.85rem;
    max-width: min(28rem, calc(100% - 1.7rem));
    border-radius: 0.3rem;
    background: rgba(255, 255, 255, 0.94);
    padding: 0.45rem 0.6rem;
    color: #242824;
    font-size: 0.74rem;
    font-weight: 850;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  }

  .embedpdf-target {
    width: 100%;
    height: 100%;
    min-height: 0;
    background: #2b2d2b;
  }

  @media (max-width: 760px) {
    .embedpdf-target {
      min-width: 760px;
    }
  }

  .viewer-error {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 0.6rem;
    height: 100%;
    min-height: 24rem;
    background: #f8f9f7;
    color: #4b514c;
    text-align: center;
  }

  .viewer-error strong {
    color: #191b19;
    font-size: 1.1rem;
  }
</style>
