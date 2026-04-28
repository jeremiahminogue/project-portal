<script lang="ts">
  import {
    CalendarDays,
    FileText,
    FolderOpen,
    Home,
    Menu,
    MessageSquare,
    Newspaper,
    Users
  } from '@lucide/svelte';
  import { page } from '$app/stores';

  let { slug, title }: { slug: string; title?: string } = $props();

  const items = $derived([
    { href: `/projects/${slug}`, label: 'Overview', icon: Home },
    {
      href: `/projects/${slug}/files`,
      label: 'Drawings',
      icon: FolderOpen,
      active: (url: URL) => url.pathname === `/projects/${slug}/files` && !['specifications', 'documents'].includes(url.searchParams.get('tool') ?? '')
    },
    {
      href: `/projects/${slug}/files?tool=specifications`,
      label: 'Specifications',
      icon: FileText,
      active: (url: URL) => url.pathname === `/projects/${slug}/files` && url.searchParams.get('tool') === 'specifications'
    },
    {
      href: `/projects/${slug}/files?tool=documents`,
      label: 'Documents',
      icon: FileText,
      active: (url: URL) => url.pathname === `/projects/${slug}/files` && url.searchParams.get('tool') === 'documents'
    },
    { href: `/projects/${slug}/submittals`, label: 'Submittals', icon: FileText },
    { href: `/projects/${slug}/rfis`, label: 'RFIs', icon: MessageSquare },
    { href: `/projects/${slug}/schedule`, label: 'Schedule', icon: CalendarDays },
    { href: `/projects/${slug}/updates`, label: 'Updates', icon: Newspaper },
    { href: `/projects/${slug}/chat`, label: 'Chat', icon: MessageSquare },
    { href: `/projects/${slug}/directory`, label: 'Directory', icon: Users }
  ]);
  const activeItem = $derived(items.find((item) => item.active?.($page.url) ?? $page.url.pathname === item.href) ?? items[0]);
</script>

<div class="border-b border-black/8 bg-white/92 backdrop-blur-xl">
  <div class="mx-auto max-w-[1480px] px-3 sm:px-6 lg:px-8">
    <div class="flex min-h-16 flex-col justify-center gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div class="min-w-0">
        <div class="text-xs font-black uppercase tracking-[0.14em] text-pe-green-dark">Project</div>
        <div class="truncate text-sm font-black text-pe-body sm:text-base">{title ?? `#${slug}`}</div>
      </div>
      <details class="project-menu">
        <summary>
          <span>
            <Menu size={16} />
            Project menu
          </span>
          <strong>{activeItem.label}</strong>
        </summary>
        <nav class="project-menu-panel" aria-label="Project sections">
          {#each items as item}
            {@const Icon = item.icon}
            <a href={item.href} class={`nav-item ${(item.active?.($page.url) ?? $page.url.pathname === item.href) ? 'active' : ''}`}>
              <Icon size={16} />
              <span>{item.label}</span>
            </a>
          {/each}
        </nav>
      </details>
      <nav class="project-nav-desktop" aria-label="Project sections">
        {#each items as item}
          {@const Icon = item.icon}
          <a href={item.href} class={`nav-item ${(item.active?.($page.url) ?? $page.url.pathname === item.href) ? 'active' : ''}`}>
            <Icon size={16} />
            <span>{item.label}</span>
          </a>
        {/each}
      </nav>
    </div>
  </div>
</div>

<style>
  .nav-item {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.15rem;
    border-radius: 0.5rem;
    padding: 0.5rem 0.68rem;
    color: #5e665f;
    font-size: 0.82rem;
    font-weight: 800;
    white-space: nowrap;
    scroll-snap-align: start;
    transition:
      background-color 150ms ease,
      color 150ms ease,
      transform 150ms ease;
  }

  .nav-item:hover {
    color: #191b19;
    background: rgba(25, 27, 25, 0.055);
  }

  .nav-item.active {
    color: #111;
    background: rgba(25, 27, 25, 0.07);
    box-shadow: inset 0 -2px 0 #18a53a;
  }

  .project-nav-desktop {
    display: flex;
    gap: 0.25rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }

  .project-menu {
    display: none;
  }

  @media (max-width: 820px) {
    .project-nav-desktop {
      display: none;
    }

    .project-menu {
      display: block;
      width: 100%;
    }

    .project-menu summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      min-height: 2.4rem;
      border: 1px solid rgba(25, 27, 25, 0.12);
      border-radius: 0.45rem;
      background: #fff;
      padding: 0.55rem 0.7rem;
      color: #191b19;
      font-size: 0.82rem;
      font-weight: 850;
      list-style: none;
      cursor: pointer;
    }

    .project-menu summary::-webkit-details-marker {
      display: none;
    }

    .project-menu summary span {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
    }

    .project-menu summary strong {
      color: #18a53a;
      font-size: 0.78rem;
    }

    .project-menu-panel {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.35rem;
      margin-top: 0.45rem;
      border: 1px solid rgba(25, 27, 25, 0.1);
      border-radius: 0.45rem;
      background: #fff;
      padding: 0.45rem;
    }

    .project-menu-panel .nav-item {
      justify-content: flex-start;
      min-width: 0;
      width: 100%;
      white-space: normal;
    }
  }

  @media (max-width: 480px) {
    .project-menu-panel {
      grid-template-columns: 1fr;
    }
  }
</style>
