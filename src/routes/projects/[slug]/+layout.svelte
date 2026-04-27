<script lang="ts">
  import AppHeader from '$lib/components/AppHeader.svelte';
  import ProjectNav from '$lib/components/ProjectNav.svelte';

  let { data, children } = $props();
</script>

<AppHeader me={data.me} />
<ProjectNav slug={data.slug} title={data.project.title} />
{@render children()}
