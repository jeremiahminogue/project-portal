<script lang="ts">
  import { onMount } from 'svelte';

  let {
    src,
    title,
    page = 1
  }: {
    src: string;
    title: string;
    page?: number;
  } = $props();

  let target = $state<HTMLDivElement | null>(null);
  let error = $state('');

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
</script>

{#if error}
  <div class="viewer-error">
    <strong>Viewer failed to load</strong>
    <span>{error}</span>
    <a class="btn btn-primary" href={src} target="_blank" rel="noreferrer">Open PDF</a>
  </div>
{:else}
  <div class="embedpdf-shell">
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
