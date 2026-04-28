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
  let useNativeFallback = $state(false);

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
    const fallbackTimer = window.setTimeout(() => {
      const hasRenderedPage = Boolean(target?.querySelector('canvas, img, [data-page-index], [data-page-number], [class*="page-layer"], [class*="Page"]'));
      if (!hasRenderedPage) useNativeFallback = true;
    }, 6000);
    cleanup.push(() => window.clearTimeout(fallbackTimer));

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
          tabBar: 'never',
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
          },
          disabledCategories: ['annotation', 'redaction', 'stamp', 'signature']
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
    <div class:native-hidden={useNativeFallback} bind:this={target} class="embedpdf-target" aria-label={`PDF viewer for ${title}`}></div>
    {#if useNativeFallback}
      <iframe class="native-pdf-fallback" src={src} title={`PDF viewer for ${title}`}></iframe>
    {/if}
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

  .embedpdf-target.native-hidden {
    display: none;
  }

  .native-pdf-fallback {
    width: 100%;
    height: 100%;
    border: 0;
    background: #eef0ef;
  }

  @media (max-width: 760px) {
    .embedpdf-target,
    .native-pdf-fallback {
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
