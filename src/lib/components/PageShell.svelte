<script lang="ts">
  let {
    wide = false,
    flush = false,
    children
  }: { wide?: boolean; flush?: boolean; children: import('svelte').Snippet } = $props();
</script>

<main class={`page-enter mx-auto w-full ${wide ? 'max-w-[1480px]' : 'max-w-7xl'} ${flush ? '' : 'px-3 py-5 sm:px-6 sm:py-8 lg:px-8'}`}>
  {@render children()}
</main>
