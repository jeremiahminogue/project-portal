<script lang="ts">
  import { LogOut, Settings, Shield, UserRound } from '@lucide/svelte';
  import { initialsFor } from '$lib/utils';

  let { me }: { me?: App.PageData['me'] } = $props();

  const initials = $derived(initialsFor(me?.profile, me?.user?.email ?? null));
  const email = $derived(me?.user?.email ?? 'Guest');
</script>

<header class="sticky top-0 z-40 border-b border-black/20 bg-pe-body text-white">
  <div class="mx-auto flex h-14 max-w-[1480px] items-center justify-between gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6 lg:px-8">
    <a href="/" class="flex min-w-0 shrink items-center gap-2 sm:gap-3" aria-label="Pueblo Electric project portal">
      <span class="grid h-11 w-[150px] place-items-center bg-white px-2 sm:w-[210px]">
        <img src="/brand/Pueblo_Electrics-1.png" alt="Pueblo Electric" class="max-h-8 w-auto object-contain sm:max-h-9" />
      </span>
      <span class="hidden h-6 w-px bg-white/18 sm:block"></span>
      <span class="hidden text-sm font-semibold text-white/78 sm:block">Project Portal</span>
    </a>

    <div class="flex items-center gap-2">
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
