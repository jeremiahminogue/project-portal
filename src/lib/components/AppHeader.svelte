<script lang="ts">
  import { page } from '$app/stores';
  import {
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
    slug
  }: {
    me?: App.PageData['me'];
    project?: HeaderProject;
    projects?: HeaderProject[];
    slug?: string;
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
          { href: `/projects/${slug}/chat`, label: 'Chat', icon: MessageSquare },
          { href: `/projects/${slug}/directory`, label: 'Directory', icon: Users }
        ]
      : []
  );
  const activeTool = $derived(
    projectTools.find((tool) => tool.active?.($page.url) ?? $page.url.pathname === tool.href) ?? projectTools[0]
  );
</script>

<header class="sticky top-0 z-40 border-b border-black/20 bg-pe-body text-white">
  <div class="mx-auto flex min-h-14 max-w-[1480px] flex-wrap items-center justify-between gap-2 px-3 py-2 sm:min-h-16 sm:gap-4 sm:px-6 lg:px-8">
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
      <a href="/" class="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3" aria-label="Pueblo Electric project portal">
        <span class="grid h-11 w-[128px] place-items-center overflow-hidden rounded-md bg-white px-2 sm:w-[190px]">
          <img src="/brand/Pueblo_Electrics-1.png" alt="Pueblo Electric" class="max-h-8 w-auto object-contain sm:max-h-9" />
        </span>
      </a>

      {#if project && slug}
        <span class="hidden h-8 w-px bg-white/18 md:block"></span>
        <details class="header-dropdown project-selector">
          <summary>
            <span>
              <small>Project</small>
              <strong>{project.title}</strong>
            </span>
            <ChevronDown size={15} />
          </summary>
          <div class="header-dropdown-panel project-panel">
            {#each projects as option}
              <a class:active-project={option.id === slug} href={`/projects/${option.id}`}>
                <span>{option.number ?? `#${option.id}`}</span>
                <strong>{option.title}</strong>
                {#if option.address || option.owner}
                  <small>{option.address || option.owner}</small>
                {/if}
              </a>
            {/each}
          </div>
        </details>

        <details class="header-dropdown tools-selector">
          <summary>
            <span>
              <small>Project Tools</small>
              <strong>{activeTool?.label ?? 'Tools'}</strong>
            </span>
            <ChevronDown size={15} />
          </summary>
          <nav class="header-dropdown-panel tools-panel" aria-label="Project tools">
            {#each projectTools as tool}
              {@const Icon = tool.icon}
              <a href={tool.href} class:active-tool={tool.active?.($page.url) ?? $page.url.pathname === tool.href}>
                <Icon size={16} />
                <span>{tool.label}</span>
              </a>
            {/each}
          </nav>
        </details>
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

  .header-dropdown summary {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem;
    min-height: 2.75rem;
    border-radius: 0.28rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    padding: 0.42rem 0.55rem 0.42rem 0.65rem;
    color: #fff;
    list-style: none;
    cursor: pointer;
    transition:
      background-color 140ms ease,
      border-color 140ms ease;
  }

  .header-dropdown summary::-webkit-details-marker {
    display: none;
  }

  .header-dropdown summary:hover,
  .header-dropdown[open] summary {
    border-color: rgba(24, 165, 58, 0.7);
    background: rgba(255, 255, 255, 0.12);
  }

  .header-dropdown summary span {
    display: grid;
    gap: 0.08rem;
    min-width: 0;
    text-align: left;
  }

  .header-dropdown summary small {
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.64rem;
    font-weight: 850;
    line-height: 1;
  }

  .header-dropdown summary strong {
    max-width: 16rem;
    overflow: hidden;
    color: #fff;
    font-size: 0.82rem;
    font-weight: 850;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-selector summary {
    width: min(21rem, 34vw);
  }

  .tools-selector summary {
    min-width: 10.5rem;
  }

  .header-dropdown-panel {
    position: absolute;
    top: calc(100% + 0.45rem);
    left: 0;
    z-index: 50;
    width: min(22rem, calc(100vw - 1.5rem));
    border: 1px solid rgba(25, 27, 25, 0.12);
    border-radius: 0.45rem;
    background: #fff;
    padding: 0.35rem;
    color: #191b19;
    box-shadow: 0 22px 60px -34px rgba(0, 0, 0, 0.55);
  }

  .project-panel {
    display: grid;
    max-height: min(28rem, calc(100vh - 6rem));
    overflow: auto;
  }

  .project-panel a {
    display: grid;
    gap: 0.12rem;
    border-radius: 0.28rem;
    padding: 0.62rem 0.7rem;
  }

  .project-panel a:hover,
  .project-panel a.active-project,
  .tools-panel a:hover,
  .tools-panel a.active-tool {
    background: #eef3fb;
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
    border-radius: 0.28rem;
    padding: 0.58rem 0.65rem;
    color: #2e342f;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .tools-panel a.active-tool {
    color: #101410;
    box-shadow: inset 3px 0 0 #18a53a;
  }

  @media (max-width: 900px) {
    .project-selector summary {
      width: min(17rem, 36vw);
    }

    .header-dropdown summary strong {
      max-width: 11rem;
    }
  }

  @media (max-width: 720px) {
    .project-selector summary {
      width: 9.5rem;
    }

    .tools-selector summary {
      min-width: 8.5rem;
    }

    .header-dropdown summary small {
      display: none;
    }

    .header-dropdown summary strong {
      max-width: 6.5rem;
    }
  }

  @media (max-width: 560px) {
    .project-selector summary {
      width: min(10rem, 42vw);
    }
  }
</style>
