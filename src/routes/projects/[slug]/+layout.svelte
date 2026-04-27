<script lang="ts">
  import { page } from '$app/stores';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import ProjectNav from '$lib/components/ProjectNav.svelte';

  let { data, children } = $props();

  const isDocumentViewer = $derived($page.route.id === '/projects/[slug]/files/[id]');
</script>

{#if !isDocumentViewer}
  <AppHeader me={data.me} />
  <ProjectNav slug={data.slug} title={data.project.title} />
{/if}
{@render children()}
