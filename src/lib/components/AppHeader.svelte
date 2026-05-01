<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    Bell,
    CalendarDays,
    ChevronDown,
    FileText,
    FolderOpen,
    Home,
    LogOut,
    MessageSquare,
    Newspaper,
    Settings,
    Shield,
    UserRound,
    Users
  } from '@lucide/svelte';
  import { initialsFor } from '$lib/utils';

  type HeaderProject = {
    id: string;
    number?: string;
    title: string;
    address?: string;
    owner?: string;
  };

  let {
    me,
    project,
    projects = [],
    slug,
    canManageProjectUsers = false
  }: {
    me?: App.PageData['me'];
    project?: HeaderProject;
    projects?: HeaderProject[];
    slug?: string;
    canManageProjectUsers?: boolean;
  } = $props();

  const initials = $derived(initialsFor(me?.profile, me?.user?.email ?? null));
  const email = $derived(me?.user?.email ?? 'Guest');
  const projectTools = $derived(
    slug
      ? [
          { href: `/projects/${slug}`, label: 'Overview', icon: Home },
          {
            href: `/projects/${slug}/files`,
            label: 'Drawings',
            icon: FolderOpen,
            active: (url: URL) =>
              url.pathname === `/projects/${slug}/files` && !['specifications', 'documents'].includes(url.searchParams.get('tool') ?? '')
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
          { href: `/projects/${slug}/notifications`, label: 'Notifications', icon: Bell },
          { href: `/projects/${slug}/chat`, label: 'Chat', icon: MessageSquare },
          { href: `/projects/${slug}/directory`, label: 'Directory', icon: Users },
          ...(canManageProjectUsers
            ? [{ href: `/projects/${slug}/members`, label: 'Members', icon: Shield }]
            : [])
        ]
      : []
  );
  const activeTool = $derived(
    projectTools.find((tool) => tool.active?.($page.url) ?? $page.url.pathname === tool.href) ?? projectTools[0]
  );

  let headerRoot: HTMLElement;
  let openMenu = $state<'project' | 'tools' | ''>('');

  function closeMenus() {
    openMenu = '';
  }

  function toggleMenu(menu: 'project' | 'tools') {
    openMenu = openMenu === menu ? '' : menu;
  }

  function handleWindowClick(event: MouseEvent) {
    if (!openMenu || !headerRoot || !(event.target instanceof Node)) return;
    if (!headerRoot.contains(event.target)) closeMenus();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeMenus();
  }

  $effect(() => {
    $page.url.href;
    closeMenus();
  });

  onMount(() => closeMenus());
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<header class="sticky top-0 z-40 border-b border-black/20 bg-pe-body text-white">
  <div
    bind:this={headerRoot}
    class="mx-auto flex min-h-14 max-w-[1480px] flex-wrap items-center justify-between gap-2 px-3 py-2 sm:min-h-16 sm:gap-4 sm:px-6 lg:px-8"
  >
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
      <a href="/" class="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3" aria-label="Pueblo Electric project portal">
        <span class="grid h-11 w-[128px] place-items-center overflow-hidden rounded-md bg-white px-2 sm:w-[190px]">
          <img src="/brand/Pueblo_Electrics-1.png" alt="Pueblo Electric" class="max-h-8 w-auto object-contain sm:max-h-9" />
        </span>
      </a>

      {#if project && slug}
        <span class="hidden h-8 w-px bg-white/18 md:block"></span>
        <div class="header-dropdown project-selector" class:open={openMenu === 'project'}>
          <button
            class="header-menu-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'project'}
            onclick={() => toggleMenu('project')}
          >
            <span>
              <small>Project</small>
              <strong>{project.title}</strong>
            </span>
            <span class="trigger-chevron"><ChevronDown size={15} /></span>
          </button>
          {#if openMenu === 'project'}
            <div class="header-dropdown-panel project-panel">
              <div class="panel-kicker">Switch Project</div>
              {#each projects as option}
                <a class:active-project={option.id === slug} href={`/projects/${option.id}`} onclick={closeMenus}>
                  <span>{option.number ?? `#${option.id}`}</span>
                  <strong>{option.title}</strong>
                  {#if option.address || option.owner}
                    <small>{option.address || option.owner}</small>
                  {/if}
                </a>
              {/each}
            </div>
          {/if}
        </div>

        <div class="header-dropdown tools-selector" class:open={openMenu === 'tools'}>
          <button
            class="header-menu-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'tools'}
            onclick={() => toggleMenu('tools')}
          >
            <span>
              <small>Project Tools</small>
              <strong>{activeTool?.label ?? 'Tools'}</strong>
            </span>
            <span class="trigger-chevron"><ChevronDown size={15} /></span>
          </button>
          {#if openMenu === 'tools'}
            <nav class="header-dropdown-panel tools-panel" aria-label="Project tools">
              <div class="panel-kicker">Project Tools</div>
              {#each projectTools as tool}
                {@const Icon = tool.icon}
                <a href={tool.href} class:active-tool={tool.active?.($page.url) ?? $page.url.pathname === tool.href} onclick={closeMenus}>
                  <Icon size={16} />
                  <span>{tool.label}</span>
                </a>
              {/each}
            </nav>
          {/if}
        </div>
      {:else}
        <span class="hidden h-6 w-px bg-white/18 sm:block"></span>
        <span class="hidden text-sm font-semibold text-white/78 sm:block">Project Portal</span>
      {/if}
    </div>

    <div class="flex shrink-0 items-center gap-2">
      {#if me?.isSuperadmin}
        <a class="btn btn-ghost hidden text-white/86 hover:bg-white/10 hover:text-white sm:inline-flex" href="/admin">
          <Shield size={16} />
          Admin
        </a>
      {/if}

      <div class="group relative">
        <button class="flex items-center gap-2 rounded-full border border-white/15 bg-white/8 py-1 pl-1 pr-1 text-sm font-semibold text-white transition hover:border-pe-green/60 sm:pr-3">
          <span class="grid h-8 w-8 place-items-center rounded-full bg-pe-green text-xs font-black text-white">{initials}</span>
          <span class="hidden max-w-48 truncate sm:block">{email}</span>
        </button>

        <div class="invisible absolute right-0 top-11 w-[min(14rem,calc(100vw-1.5rem))] translate-y-1 rounded-lg border border-black/10 bg-white p-2 text-pe-body opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
          <div class="px-3 py-2 text-xs text-pe-sub">
            <div class="font-bold text-pe-body">{me?.profile?.full_name ?? 'Portal user'}</div>
            <div class="truncate">{email}</div>
          </div>
          {#if me?.isSuperadmin}
            <a href="/admin" class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-pe-body hover:bg-pe-green/10 hover:text-pe-green-dark">
              <Settings size={16} />
              Admin console
            </a>
          {/if}
          {#if me?.user}
            <form method="post" action="/auth/signout">
              <button class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-pe-body hover:bg-pe-green/10 hover:text-pe-green-dark">
                <LogOut size={16} />
                Sign out
              </button>
            </form>
          {:else}
            <a href="/login" class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-pe-body hover:bg-pe-green/10 hover:text-pe-green-dark">
              <UserRound size={16} />
              Sign in
            </a>
          {/if}
        </div>
      </div>
    </div>
  </div>
</header>

<style>
  .header-dropdown {
    position: relative;
    min-width: 0;
  }

  .header-menu-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
    min-height: 2.75rem;
    border-radius: 0.36rem;
    border: 1px solid rgba(255, 255, 255, 0.13);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.07)),
      rgba(255, 255, 255, 0.05);
    padding: 0.42rem 0.55rem 0.42rem 0.65rem;
    color: #fff;
    cursor: pointer;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 10px 24px -20px rgba(0, 0, 0, 0.85);
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease,
      transform 140ms ease;
  }

  .header-menu-trigger:hover,
  .header-dropdown.open .header-menu-trigger {
    border-color: rgba(24, 165, 58, 0.74);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.17), rgba(255, 255, 255, 0.1)),
      rgba(24, 165, 58, 0.06);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.16),
      0 14px 30px -22px rgba(0, 0, 0, 0.9);
  }

  .header-menu-trigger:active {
    transform: translateY(1px);
  }

  .header-menu-trigger span {
    display: grid;
    gap: 0.08rem;
    min-width: 0;
    text-align: left;
  }

  .header-menu-trigger small {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.64rem;
    font-weight: 850;
    line-height: 1;
  }

  .header-menu-trigger strong {
    max-width: 16rem;
    overflow: hidden;
    color: #fff;
    font-size: 0.82rem;
    font-weight: 850;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger-chevron {
    color: rgba(255, 255, 255, 0.72);
    transition: transform 150ms ease;
  }

  .header-dropdown.open .trigger-chevron {
    transform: rotate(180deg);
  }

  .project-selector .header-menu-trigger {
    width: min(21rem, 34vw);
  }

  .tools-selector .header-menu-trigger {
    min-width: 10.5rem;
  }

  .header-dropdown-panel {
    position: absolute;
    top: calc(100% + 0.45rem);
    left: 0;
    z-index: 50;
    width: min(22rem, calc(100vw - 1.5rem));
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 0.58rem;
    background: #fff;
    padding: 0.45rem;
    color: #191b19;
    box-shadow:
      0 28px 74px -38px rgba(0, 0, 0, 0.62),
      0 0 0 1px rgba(255, 255, 255, 0.8) inset;
    animation: menu-enter 130ms ease-out both;
    transform-origin: top left;
  }

  .panel-kicker {
    padding: 0.45rem 0.55rem 0.38rem;
    color: #717970;
    font-size: 0.65rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .project-panel {
    display: grid;
    max-height: min(28rem, calc(100vh - 6rem));
    overflow: auto;
  }

  .project-panel a {
    display: grid;
    gap: 0.12rem;
    border-radius: 0.4rem;
    border: 1px solid transparent;
    padding: 0.66rem 0.72rem;
    transition:
      background-color 130ms ease,
      border-color 130ms ease,
      transform 130ms ease;
  }

  .project-panel a:hover,
  .project-panel a.active-project,
  .tools-panel a:hover,
  .tools-panel a.active-tool {
    border-color: #dfe6f1;
    background: #f2f6fb;
  }

  .project-panel a:hover,
  .tools-panel a:hover {
    transform: translateX(1px);
  }

  .project-panel a.active-project,
  .tools-panel a.active-tool {
    background: linear-gradient(90deg, rgba(24, 165, 58, 0.13), #f7faf8);
  }

  .project-panel span {
    color: #687068;
    font-size: 0.66rem;
    font-weight: 850;
  }

  .project-panel strong {
    color: #171917;
    font-size: 0.84rem;
    font-weight: 850;
  }

  .project-panel small {
    overflow: hidden;
    color: #687068;
    font-size: 0.72rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tools-panel {
    display: grid;
    width: 14.5rem;
  }

  .tools-panel a {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 0.4rem;
    border: 1px solid transparent;
    padding: 0.62rem 0.68rem;
    color: #2e342f;
    font-size: 0.82rem;
    font-weight: 800;
    transition:
      background-color 130ms ease,
      border-color 130ms ease,
      transform 130ms ease;
  }

  .tools-panel a.active-tool {
    color: #101410;
    box-shadow: inset 3px 0 0 #18a53a;
  }

  @keyframes menu-enter {
    from {
      opacity: 0;
      transform: translateY(-0.25rem) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 900px) {
    .project-selector .header-menu-trigger {
      width: min(17rem, 36vw);
    }

    .header-menu-trigger strong {
      max-width: 11rem;
    }
  }

  @media (max-width: 720px) {
    .project-selector .header-menu-trigger {
      width: 9.5rem;
    }

    .tools-selector .header-menu-trigger {
      min-width: 8.5rem;
    }

    .header-menu-trigger small {
      display: none;
    }

    .header-menu-trigger strong {
      max-width: 6.5rem;
    }
  }

  @media (max-width: 560px) {
    .project-selector .header-menu-trigger {
      width: min(10rem, 42vw);
    }
  }
</style>
