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
      if (!scrollCapability.scrollToPage) return;
      const targetPage = Math.min(Math.max(1, page), Math.max(1, totalPages ?? page));
      scrollCapability.scrollToPage({ pageNumber: targetPage, behavior: 'instant', alignY: 0 });
    }

    async function mountViewer() {
      try {
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
          if (!cancelled) scrollToInitialPage(scroll, event.totalPages);
        });
        if (unsubscribe) cleanup.push(unsubscribe);
        scrollToInitialPage(scroll, scrollEvents.getTotalPages?.());
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
  <div bind:this={target} class="embedpdf-target" aria-label={`PDF viewer for ${title}`}></div>
{/if}

<style>
  .embedpdf-target {
    width: 100%;
    height: 100%;
    min-height: 0;
    background: #2b2d2b;
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
