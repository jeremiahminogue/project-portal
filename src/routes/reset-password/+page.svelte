<script lang="ts">
  import { enhance } from '$app/forms';
  import { ArrowRight, Eye, EyeOff, ShieldCheck } from '@lucide/svelte';

  let { data, form } = $props();
  let showPassword = $state(false);
  let showConfirm = $state(false);
  let submitting = $state(false);
  const updated = $derived(Boolean(form?.updated));
</script>

<svelte:head>
  <title>Set password | Pueblo Electric Project Portal</title>
</svelte:head>

<main class="grid min-h-screen place-items-center px-4 py-8">
  <section class="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-2xl shadow-black/10 sm:p-8">
    <img src="/brand/Pueblo_Electrics-1.png" alt="Pueblo Electric" class="mb-8 h-10 w-auto" />
    <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">Project Portal</p>
    <h1 class="mt-2 text-3xl font-black text-pe-body">Set password</h1>
    <p class="mt-2 text-sm leading-6 text-pe-sub">
      {data.email ? data.email : 'Open the reset link from your email to continue.'}
    </p>

    {#if data.error}
      <div class="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{data.error}</div>
    {/if}
    {#if form?.error}
      <div class="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>
    {/if}
    {#if form?.updated}
      <div class="mt-5 rounded-lg border border-pe-green/20 bg-pe-green/10 px-3 py-2 text-sm font-semibold text-pe-green-dark">
        Password updated. You can continue to the portal.
      </div>
      <a class="btn btn-primary mt-5 w-full" href="/">
        Continue
        <ArrowRight size={16} />
      </a>
    {:else if data.ready}
      <form
        method="post"
        action="?/updatePassword"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            try {
              await update();
            } finally {
              submitting = false;
            }
          };
        }}
        class="mt-6 space-y-4"
      >
        <div>
          <label class="label" for="password">New password</label>
          <div class="relative">
            <input class="field pr-11" id="password" name="password" type={showPassword ? 'text' : 'password'} autocomplete="new-password" required minlength="8" placeholder="New password" disabled={submitting || updated} />
            <button class="absolute inset-y-0 right-0 grid w-11 place-items-center text-pe-sub hover:text-pe-body" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onclick={() => (showPassword = !showPassword)}>
              {#if showPassword}<EyeOff size={17} />{:else}<Eye size={17} />{/if}
            </button>
          </div>
        </div>
        <div>
          <label class="label" for="confirmPassword">Confirm password</label>
          <div class="relative">
            <input class="field pr-11" id="confirmPassword" name="confirmPassword" type={showConfirm ? 'text' : 'password'} autocomplete="new-password" required minlength="8" placeholder="Confirm password" disabled={submitting || updated} />
            <button class="absolute inset-y-0 right-0 grid w-11 place-items-center text-pe-sub hover:text-pe-body" type="button" aria-label={showConfirm ? 'Hide password' : 'Show password'} onclick={() => (showConfirm = !showConfirm)}>
              {#if showConfirm}<EyeOff size={17} />{:else}<Eye size={17} />{/if}
            </button>
          </div>
        </div>
        <button class="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-65" type="submit" disabled={submitting || updated}>
          {submitting ? 'Updating...' : 'Update password'}
          <ShieldCheck size={16} />
        </button>
      </form>
    {:else}
      <a class="btn btn-primary mt-6 w-full" href="/forgot-password">Request reset link</a>
    {/if}
  </section>
</main>
