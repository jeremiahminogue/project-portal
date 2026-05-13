<script lang="ts">
  import { Download, ExternalLink, FileText } from '@lucide/svelte';

  let { src, title }: { src: string; title: string } = $props();
  const downloadSrc = $derived(src.replace('inline=1', 'download=1'));
</script>

<div class="pdf-card">
  <div class="flex items-center justify-between gap-3 border-b border-black/8 px-3 py-2">
    <div class="flex min-w-0 items-center gap-2 text-sm font-black text-pe-body">
      <FileText size={16} />
      <span class="truncate">{title}</span>
    </div>
    <div class="flex items-center gap-1">
      <a class="btn btn-ghost min-h-8 px-2" href={downloadSrc} aria-label={`Download ${title}`} title="Download PDF">
        <Download size={15} />
      </a>
      <a class="btn btn-ghost min-h-8 px-2" href={src} target="_blank" rel="noreferrer" aria-label={`Open ${title} in a new tab`} title="Open PDF in new tab">
        <ExternalLink size={15} />
      </a>
    </div>
  </div>

  <div class="pdf-frame">
    <iframe class="h-full w-full border-0" title={title} src={src}></iframe>
  </div>
</div>

<style>
  .pdf-card {
    min-width: 0;
    overflow: hidden;
    border-radius: 0.7rem;
    border: 1px solid rgba(31, 35, 32, 0.1);
    background: #fff;
    box-shadow: 0 18px 56px -40px rgba(0, 0, 0, 0.45);
  }

  .pdf-frame {
    height: clamp(26rem, 58vh, 42rem);
    min-height: 0;
    background: #f4f5f2;
  }
</style>
