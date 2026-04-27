<script lang="ts">
  import AppHeader from '$lib/components/AppHeader.svelte';

  let { data, children } = $props();
  const links = [
    { href: '/admin', label: 'Overview' },
    { href: '/admin/projects', label: 'Projects' },
    { href: '/admin/users', label: 'Users' }
  ];
</script>

<AppHeader me={data.me} />
<div class="border-b border-black/8 bg-white/92 backdrop-blur-xl">
  <nav class="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 py-3 sm:px-6 lg:px-8">
    {#each links as link}
      <a class="rounded-md px-3 py-2 text-sm font-black text-pe-sub hover:bg-black/[0.055] hover:text-pe-body" href={link.href}>{link.label}</a>
    {/each}
  </nav>
</div>
{@render children()}
