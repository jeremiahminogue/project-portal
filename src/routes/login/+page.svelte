<script lang="ts">
  import { enhance } from '$app/forms';
  import { ArrowRight, Eye, EyeOff, ShieldCheck } from '@lucide/svelte';

  let { data, form } = $props();
  let showPassword = $state(false);
  const next = $derived(data.next ?? '/');
</script>

<svelte:head>
  <title>Sign in | Pueblo Electric Project Portal</title>
</svelte:head>

<main class="grid min-h-screen place-items-center px-4 py-8">
  <section class="grid w-full max-w-5xl overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl shadow-black/10 lg:grid-cols-[1fr_430px]">
    <div class="relative hidden min-h-[620px] overflow-hidden bg-pe-body p-10 text-white lg:block">
      <div class="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.08),rgba(25,27,25,.98))]"></div>
      <div class="absolute left-0 top-0 h-full w-1 bg-pe-green"></div>
      <div class="relative flex h-full flex-col justify-between">
        <img src="/brand/Pueblo_Electrics-1.png" alt="Pueblo Electric" class="h-10 w-fit rounded-md bg-white/95 px-3 py-1" />
        <div>
          <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white/78">
            <ShieldCheck size={14} />
            Prime contractor portal
          </div>
          <h1 class="max-w-md text-5xl font-black leading-[0.95]">Project files, submittals, RFIs, and decisions in one clean workspace.</h1>
          <p class="mt-5 max-w-md text-base leading-7 text-white/75">Built for owners, designers, reviewers, and Pueblo Electric project teams who need the current set without chasing email threads.</p>
        </div>
      </div>
    </div>

    <div class="p-6 sm:p-9">
      <div class="mb-8 lg:hidden">
        <img src="/brand/Pueblo_Electrics-1.png" alt="Pueblo Electric" class="h-9 w-auto" />
      </div>

      <div class="mb-6">
        <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">Project Portal</p>
        <h2 class="mt-2 text-3xl font-black text-pe-body">Welcome back</h2>
        <p class="mt-2 text-sm leading-6 text-pe-sub">Use your Pueblo Electric portal credentials. New client and project access is managed from the admin console.</p>
      </div>

      {#if form?.error}
        <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>
      {/if}

      <form method="post" action="?/signin" use:enhance class="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label class="label" for="email">Email</label>
          <input class="field" id="email" name="email" type="email" autocomplete="email" value={form?.email ?? ''} required placeholder="you@company.com" />
        </div>
        <div>
          <div class="flex items-center justify-between gap-3">
            <label class="label" for="password">Password</label>
            <a class="text-xs font-black text-pe-green-dark underline" href="/forgot-password">Reset password</a>
          </div>
          <div class="relative">
            <input class="field pr-11" id="password" name="password" type={showPassword ? 'text' : 'password'} autocomplete="current-password" required placeholder="Password" />
            <button class="absolute inset-y-0 right-0 grid w-11 place-items-center text-pe-sub hover:text-pe-body" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onclick={() => (showPassword = !showPassword)}>
              {#if showPassword}<EyeOff size={17} />{:else}<Eye size={17} />{/if}
            </button>
          </div>
        </div>
        <button class="btn btn-primary w-full" type="submit">
          Sign in
          <ArrowRight size={16} />
        </button>
      </form>
    </div>
  </section>
</main>
