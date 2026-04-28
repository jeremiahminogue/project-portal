<script lang="ts">
  import { page } from '$app/stores';
  import AppHeader from '$lib/components/AppHeader.svelte';

  let { data, children } = $props();

  const isDocumentViewer = $derived($page.route.id === '/projects/[slug]/files/[id]');
</script>

{#if !isDocumentViewer}
  <AppHeader me={data.me} project={data.project} projects={data.projects} slug={data.slug} />
{/if}
{@render children()}
