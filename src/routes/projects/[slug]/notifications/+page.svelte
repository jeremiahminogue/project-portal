<script lang="ts">
  import { enhance } from '$app/forms';
  import { Bell, Check, Clock3, Lock, RefreshCw, Send } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import { relativeTime } from '$lib/utils';

  let { data, form } = $props();
  let activeSection = $state('my-notifications');
  const implementedEventDefinitions = $derived(data.eventDefinitions);
  const preferenceEventDefinitions = $derived(
    implementedEventDefinitions.filter((definition) => definition.type !== 'photo.uploaded')
  );

  function recipientLabel(kind: string) {
    return data.recipientDefinitions.find((definition) => definition.kind === kind)?.label ?? kind;
  }

  function recipientDescription(kind: string) {
    return data.recipientDefinitions.find((definition) => definition.kind === kind)?.description ?? '';
  }

  function eventRules(type: string) {
    return data.rules.filter((rule) => rule.eventType === type);
  }

  function ruleKey(rule: { eventType: string; recipientKind: string }) {
    return `${rule.eventType}:${rule.recipientKind}`;
  }

  function preferenceEnabled(type: string, configurable: boolean) {
    if (!configurable) return true;
    return data.preferences[type] !== false;
  }
</script>

<svelte:head>
  <title>Notifications | {data.project?.title}</title>
</svelte:head>

<PageShell wide>
  <section class="tool-heading">
    <div class="min-w-0">
      <h1>Notifications</h1>
      <p>Manage workflow emails, action-required alerts, and daily photo digests for this project.</p>
      <div class="tool-tabs" aria-label="Notification sections">
        {#if data.access.canManageRules}<a class:active={activeSection === 'admin-tools'} href="#admin-tools" onclick={() => (activeSection = 'admin-tools')}>Admin tools</a>{/if}
        <a class:active={activeSection === 'my-notifications'} href="#my-notifications" onclick={() => (activeSection = 'my-notifications')}>My notifications</a>
        {#if data.access.canManageRules}<a class:active={activeSection === 'matrix'} href="#matrix" onclick={() => (activeSection = 'matrix')}>Project matrix</a>{/if}
        <a class:active={activeSection === 'deliveries'} href="#deliveries" onclick={() => (activeSection = 'deliveries')}>Delivery log</a>
      </div>
    </div>
  </section>

  {#if form?.error}
    <div class="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>
  {/if}
  {#if form?.ok}
    <div class="mb-3 rounded-md border border-pe-green/20 bg-pe-green/10 px-3 py-2 text-sm font-semibold text-pe-green-dark">{form.message ?? 'Notification settings saved.'}</div>
  {/if}

  {#if data.access.canManageRules}
    <section id="admin-tools" class="utility-panel admin-tools mb-4">
      <div class="section-title">
        <div>
          <span class="eyebrow">Admin tools</span>
          <h2>Notification setup</h2>
        </div>
        <span class="readonly-chip provider-chip" class:offline={!data.emailProviderConfigured}>
          {data.emailProviderConfigured ? 'Email provider connected' : 'Email provider not configured'}
        </span>
      </div>

      <div class="settings-breakdown" aria-label="Notification settings breakdown">
        <article>
          <strong>My notifications</strong>
          <span>Each user controls optional email events and daily photo digests. Action-required emails stay locked on.</span>
        </article>
        <article>
          <strong>Project matrix</strong>
          <span>Admins choose which recipient groups receive each event. Required workflow rows stay enabled.</span>
        </article>
        <article>
          <strong>Delivery log</strong>
          <span>Admins can see recent project deliveries and retry failed or skipped messages.</span>
        </article>
      </div>

      <form class="test-email-form" method="post" action="?/sendTestEmail" use:enhance>
        <label>
          <span>Test recipient</span>
          <input class="field" name="recipient" type="email" value={data.adminEmail ?? ''} placeholder="name@example.com" />
        </label>
        <div class="test-email-meta">
          <span>From: {data.emailFrom}</span>
          <button class="btn btn-secondary" type="submit"><Send size={16} />Send test email</button>
        </div>
      </form>
    </section>
  {/if}

  <section id="my-notifications" class="utility-panel mb-4">
    <div class="section-title">
      <div>
        <span class="eyebrow">My notifications</span>
        <h2>Email preferences</h2>
      </div>
      <span class="readonly-chip">Action-required emails stay on</span>
    </div>
    <form method="post" action="?/savePreferences" use:enhance>
      <div class="preference-grid">
        {#each preferenceEventDefinitions as definition}
          <label class="preference-row" class:locked={!definition.userConfigurable}>
            <input
              name="eventTypes"
              value={definition.type}
              type="checkbox"
              checked={preferenceEnabled(definition.type, definition.userConfigurable)}
              disabled={!definition.userConfigurable}
            />
            <span>
              <strong>{definition.label}</strong>
              <small>{definition.description}</small>
            </span>
            {#if !definition.userConfigurable}<Lock size={15} />{/if}
          </label>
        {/each}
      </div>

      <label class="photo-digest-toggle">
        <input name="photoDigest" type="checkbox" checked={data.photoSubscribed} />
        <Clock3 size={16} />
        <span>
          <strong>Subscribe to daily uploaded-photo digest</strong>
          <small>One daily email lists new eligible project photos and includes download links when available.</small>
        </span>
      </label>

      <div class="form-actions">
        <button class="btn btn-primary" type="submit"><Check size={16} />Save preferences</button>
      </div>
    </form>
  </section>

  {#if data.access.canManageRules}
    <section id="matrix" class="workbench matrix-workbench mb-4">
      <div class="matrix-heading">
        <span class="eyebrow">Project matrix</span>
        <h2>Default recipient rules</h2>
      </div>
      <form method="post" action="?/saveMatrix" use:enhance>
        <div class="dense-table-shell">
          <table class="dense-table matrix-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Recipient</th>
                <th>Frequency</th>
                <th>Send</th>
              </tr>
            </thead>
            <tbody>
              {#each implementedEventDefinitions as definition}
                {@const rules = eventRules(definition.type)}
                {#each rules as rule, index}
                  <tr>
                    {#if index === 0}
                      <td rowspan={rules.length}>
                        <strong>{definition.label}</strong>
                        <span>{definition.description}</span>
                      </td>
                    {/if}
                    <td>
                      <strong>{recipientLabel(rule.recipientKind)}</strong>
                      <span>{recipientDescription(rule.recipientKind)}</span>
                    </td>
                    <td>{rule.digestFrequency === 'daily' ? 'Daily digest' : rule.digestFrequency === 'hourly' ? 'Hourly digest' : 'Immediate'}</td>
                    <td>
                      <label class="matrix-check">
                        <input name="rules" value={ruleKey(rule)} type="checkbox" checked={rule.enabled || rule.required} disabled={rule.required} />
                        {#if rule.required}<span>Required</span>{:else}<span>Enabled</span>{/if}
                      </label>
                    </td>
                  </tr>
                {/each}
              {/each}
            </tbody>
          </table>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit"><Send size={16} />Save matrix</button>
        </div>
      </form>
    </section>
  {/if}

  <section id="deliveries" class="workbench delivery-workbench">
    <div class="matrix-heading">
      <span class="eyebrow">Delivery log</span>
      <h2>Recent notification deliveries</h2>
    </div>
    <div class="dense-table-shell">
      <table class="dense-table delivery-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Event</th>
            <th>Recipient</th>
            <th>Subject</th>
            <th>Status</th>
            {#if data.access.canManageRules}<th>Action</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each data.deliveries as delivery}
            <tr>
              <td>{relativeTime(delivery.createdAt)}</td>
              <td>{delivery.eventType || '-'}</td>
              <td>{delivery.recipient}</td>
              <td>
                <strong>{delivery.subject}</strong>
                {#if delivery.error}<span class="delivery-error">{delivery.error}</span>{/if}
              </td>
              <td><span class={`status-badge ${delivery.status}`}>{delivery.status}</span></td>
              {#if data.access.canManageRules}
                <td>
                  {#if delivery.status === 'failed' || delivery.status === 'skipped'}
                    <form method="post" action="?/retryDelivery" use:enhance>
                      <input type="hidden" name="id" value={delivery.id} />
                      <button class="mini-button" type="submit" title="Retry notification"><RefreshCw size={14} />Retry</button>
                    </form>
                  {:else}
                    -
                  {/if}
                </td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={data.access.canManageRules ? 6 : 5}>
                <div class="empty-log">
                  <Bell size={20} />
                  <strong>No notification deliveries yet.</strong>
                  <span>New RFI, submittal, and photo events will appear here after they are processed.</span>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</PageShell>

<style>
  .section-title,
  .matrix-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.9rem;
  }

  .section-title h2,
  .matrix-heading h2 {
    margin: 0.16rem 0 0;
    color: #191b19;
    font-size: 1rem;
    font-weight: 850;
  }

  .admin-tools {
    padding: 0.9rem;
  }

  .provider-chip {
    border-color: rgba(18, 129, 45, 0.24);
    background: #e9f8ee;
    color: #12812d;
  }

  .provider-chip.offline {
    border-color: #f5d3b3;
    background: #fff7e7;
    color: #946200;
  }

  .settings-breakdown {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .settings-breakdown article {
    display: grid;
    gap: 0.22rem;
    min-height: 6.2rem;
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 0.35rem;
    background: #fff;
    padding: 0.75rem;
  }

  .settings-breakdown strong {
    color: #191b19;
    font-size: 0.82rem;
    font-weight: 850;
  }

  .settings-breakdown span,
  .test-email-meta span,
  .test-email-form label span {
    color: #4e574f;
    font-size: 0.74rem;
    line-height: 1.35;
  }

  .test-email-form {
    display: grid;
    grid-template-columns: minmax(16rem, 1fr) auto;
    align-items: end;
    gap: 0.7rem;
    margin-top: 0.75rem;
    border-top: 1px solid rgba(25, 27, 25, 0.08);
    padding-top: 0.75rem;
  }

  .test-email-form label,
  .test-email-meta {
    display: grid;
    gap: 0.32rem;
  }

  .test-email-meta {
    justify-items: end;
  }

  .preference-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .preference-row,
  .photo-digest-toggle {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 0.35rem;
    background: #fff;
    padding: 0.7rem;
    color: #202720;
  }

  .preference-row input,
  .photo-digest-toggle input,
  .matrix-check input {
    width: 1rem;
    height: 1rem;
    accent-color: #191b19;
  }

  .preference-row span,
  .photo-digest-toggle span,
  .matrix-table td span,
  .delivery-table td span {
    display: grid;
    gap: 0.14rem;
  }

  .preference-row strong,
  .photo-digest-toggle strong {
    color: #191b19;
    font-size: 0.82rem;
    font-weight: 850;
  }

  .preference-row small,
  .photo-digest-toggle small {
    color: #4e574f;
    font-size: 0.74rem;
    line-height: 1.35;
  }

  .preference-row.locked {
    background: #f5f7f4;
  }

  .photo-digest-toggle {
    grid-template-columns: auto auto minmax(0, 1fr);
    margin-top: 0.65rem;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.9rem;
  }

  .matrix-workbench,
  .delivery-workbench {
    display: block;
    padding: 0.85rem;
  }

  .matrix-table th:nth-child(1) {
    width: 28%;
  }

  .matrix-table th:nth-child(3),
  .matrix-table th:nth-child(4) {
    width: 10rem;
  }

  .matrix-table td strong,
  .delivery-table td strong {
    display: block;
    color: #191b19;
    font-weight: 850;
  }

  .matrix-table td span {
    color: #4e574f;
    font-size: 0.72rem;
    line-height: 1.35;
  }

  .matrix-check {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .status-badge {
    display: inline-flex !important;
    width: fit-content;
    border-radius: 999px;
    padding: 0.16rem 0.48rem;
    background: #eef3fb;
    color: #1d5fb8;
    font-size: 0.72rem;
    font-weight: 850;
  }

  .status-badge.sent {
    background: #e9f8ee;
    color: #12812d;
  }

  .status-badge.failed {
    background: #fff0ee;
    color: #b42318;
  }

  .status-badge.queued,
  .status-badge.processing {
    background: #fff7e7;
    color: #946200;
  }

  .delivery-error {
    margin-top: 0.18rem;
    color: #b42318;
    font-size: 0.72rem;
  }

  @media (max-width: 860px) {
    .settings-breakdown {
      grid-template-columns: 1fr;
    }

    .test-email-form {
      grid-template-columns: 1fr;
    }

    .test-email-meta {
      justify-items: stretch;
    }

    .preference-grid {
      grid-template-columns: 1fr;
    }

    .matrix-table,
    .delivery-table {
      min-width: 820px;
    }
  }

  @media (max-width: 640px) {
    .section-title,
    .matrix-heading {
      align-items: stretch;
      flex-direction: column;
      gap: 0.45rem;
    }

    .section-title .readonly-chip {
      width: fit-content;
      max-width: 100%;
    }

    .form-actions {
      justify-content: stretch;
    }

    .form-actions .btn {
      width: 100%;
    }
  }
</style>
