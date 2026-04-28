<script lang="ts">
  import { enhance } from '$app/forms';
  import { ArrowLeft, Mail } from '@lucide/svelte';

  let { form } = $props();
  let submitting = $state(false);
  const sent = $derived(Boolean(form?.sent));
</script>

<svelte:head>
  <title>Reset password | Pueblo Electric Project Portal</title>
</svelte:head>

<main class="grid min-h-screen place-items-center px-4 py-8">
  <section class="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-2xl shadow-black/10 sm:p-8">
    <img src="/brand/Pueblo_Electrics-1.png" alt="Pueblo Electric" class="mb-8 h-10 w-auto" />
    <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">Project Portal</p>
    <h1 class="mt-2 text-3xl font-black text-pe-body">Reset password</h1>
    <p class="mt-2 text-sm leading-6 text-pe-sub">Enter your portal email and we'll send a secure reset link.</p>

    {#if form?.error}
      <div class="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>
    {/if}
    {#if form?.sent}
      <div class="mt-5 rounded-lg border border-pe-green/20 bg-pe-green/10 px-3 py-2 text-sm font-semibold text-pe-green-dark">
        {form.limited ? 'A reset email was already requested. Use the newest link in your inbox, or try once more in a minute if nothing arrives.' : 'Check your email for the reset link.'}
      </div>
    {/if}

    <form
      method="post"
      action="?/requestReset"
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
        <label class="label" for="email">Email</label>
        <input class="field" id="email" name="email" type="email" autocomplete="email" value={form?.email ?? ''} required placeholder="you@company.com" disabled={submitting || sent} />
      </div>
      <button class="btn btn-primary w-full disabled:cursor-not-allowed disabled:opacity-65" type="submit" disabled={submitting || sent}>
        {submitting ? 'Sending...' : sent ? 'Email sent' : 'Send reset link'}
        <Mail size={16} />
      </button>
    </form>

    <a class="mt-5 inline-flex items-center gap-2 text-sm font-black text-pe-green-dark" href="/login">
      <ArrowLeft size={15} />
      Back to sign in
    </a>
  </section>
</main>
