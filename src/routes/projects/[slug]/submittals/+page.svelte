<script lang="ts">
  import { enhance } from '$app/forms';
  import { ArrowRight, Bell, Check, FilePlus2, PencilLine, Search, X } from '@lucide/svelte';
  import AttachmentChips from '$lib/components/AttachmentChips.svelte';
  import AttachmentFields from '$lib/components/AttachmentFields.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  type SubmittalRoutingStep = {
    order: number;
    assignee: string;
    role: string;
    status: string;
    dueDate?: string | null;
    response?: string | null;
  };

  type PortalSubmittal = {
    id?: string;
    number: string;
    title: string;
    specSection?: string | null;
    status: string;
    owner?: string | null;
    ownerId?: string | null;
    revision?: number | null;
    submitBy?: string | null;
    dueDate?: string | null;
    receivedFrom?: string | null;
    routing: string[];
    routingSteps?: SubmittalRoutingStep[];
    currentStep?: number;
    attachments?: { id?: string; name: string; size: string; type: string; path?: string }[];
  };

  let { data, form } = $props();
  let showSubmittalForm = $state(false);
  let activeSubmittal = $state('');
  let query = $state('');
  let savedView = $state('all');
  let decisionStatus = $state('in_review');
  const canCreateCommunication = $derived(data.communicationAccess?.canCreate ?? true);
  const canReviewCommunication = $derived(data.communicationAccess?.canReview ?? true);
  const canAttachFiles = $derived(data.communicationAccess?.canAttachFiles ?? true);
  const openCount = $derived(data.submittals.filter((item) => !isClosedStatus(item.status)).length);
  const closedCount = $derived(data.submittals.filter((item) => isClosedStatus(item.status)).length);
  const ballCount = $derived(data.submittals.filter((item) => item.owner).length);

  const filteredSubmittals = $derived(
    data.submittals.filter((item) => {
      const queryOk = !query || `${item.number} ${item.title} ${item.specSection} ${item.owner}`.toLowerCase().includes(query.toLowerCase());
      const viewOk =
        savedView === 'all' ||
        (savedView === 'open' && !['Approved', 'Rejected'].includes(item.status)) ||
        (savedView === 'closed' && ['Approved', 'Rejected'].includes(item.status)) ||
        (savedView === 'ball' && item.owner);
      return queryOk && viewOk;
    })
  );

  const selectedSubmittal = $derived(filteredSubmittals.find((item) => (item.id ?? item.number) === activeSubmittal) ?? filteredSubmittals[0] ?? data.submittals[0]);

  $effect(() => {
    if (!selectedSubmittal) {
      activeSubmittal = '';
      return;
    }

    const id = selectedSubmittal.id ?? selectedSubmittal.number;
    if (activeSubmittal !== id) activeSubmittal = id;
    decisionStatus = statusValue(selectedSubmittal.status);
  });

  function statusValue(label: string) {
    const statuses: Record<string, string> = {
      Draft: 'draft',
      Submitted: 'submitted',
      'In Review': 'in_review',
      Approved: 'approved',
      'Revise & Resubmit': 'revise_resubmit',
      Rejected: 'rejected'
    };
    return statuses[label] ?? 'in_review';
  }

  function clearFilters() {
    query = '';
    savedView = 'all';
  }

  function isClosedStatus(status: string) {
    return status === 'Approved' || status === 'Rejected';
  }

  function submittalKey(submittal: PortalSubmittal) {
    return submittal.id ?? submittal.number;
  }

  function selectSubmittal(submittal: PortalSubmittal) {
    activeSubmittal = submittalKey(submittal);
  }

  function selectSubmittalButton(event: MouseEvent, submittal: PortalSubmittal) {
    event.stopPropagation();
    selectSubmittal(submittal);
  }

  function routeSummary(submittal: PortalSubmittal) {
    const stepCount = submittal.routingSteps?.length ?? 0;
    if (stepCount > 0) return `${stepCount} step${stepCount === 1 ? '' : 's'}`;
    return submittal.routing.join(', ') || 'Not routed';
  }

  function routedCount(submittal: PortalSubmittal) {
    return submittal.routingSteps?.length || submittal.routing.length;
  }

  function stepState(step: SubmittalRoutingStep, submittal: PortalSubmittal) {
    if (step.order === (submittal.currentStep ?? 0) && !isClosedStatus(submittal.status)) return 'current';
    if (step.status === 'Approved') return 'complete';
    if (step.status === 'Revise & Resubmit' || step.status === 'Rejected') return 'attention';
    return 'waiting';
  }
</script>

<svelte:head>
  <title>Submittals | {data.project?.title}</title>
</svelte:head>

<PageShell wide>
  <section class="tool-heading">
    <div class="min-w-0">
      <h1>Submittals</h1>
      <p>Create, assign, review, and track submittal packages without mixing them into the drawing log.</p>
      <div class="tool-tabs" aria-label="Submittal sections">
        <button class:active={savedView === 'all'} type="button" onclick={() => (savedView = 'all')}>Items</button>
        <button class:active={savedView === 'ball'} type="button" onclick={() => (savedView = 'ball')}>Ball In Court</button>
        <button class:active={savedView === 'open'} type="button" onclick={() => (savedView = 'open')}>Open</button>
        <button class:active={savedView === 'closed'} type="button" onclick={() => (savedView = 'closed')}>Closed</button>
      </div>
    </div>
    {#if canCreateCommunication}
      <div class="tool-actions">
        <button class="btn btn-primary" type="button" onclick={() => (showSubmittalForm = !showSubmittalForm)}>
          {#if showSubmittalForm}<X size={16} />Close form{:else}<FilePlus2 size={16} />New submittal{/if}
        </button>
      </div>
    {/if}
  </section>

  {#if form?.error}
    <div class="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>
  {/if}
  {#if form?.ok}
    <div class="mb-3 rounded-md border border-pe-green/20 bg-pe-green/10 px-3 py-2 text-sm font-semibold text-pe-green-dark">Saved.</div>
  {/if}

  {#if showSubmittalForm && canCreateCommunication}
    <form class="utility-panel mb-3 grid gap-4 md:grid-cols-2 xl:grid-cols-5" method="post" action="?/createSubmittal" enctype="multipart/form-data" use:enhance>
      <div><label class="label" for="sub-number">Number</label><input id="sub-number" class="field" name="number" placeholder="1646-001" required /></div>
      <div class="xl:col-span-2"><label class="label" for="sub-title">Title</label><input id="sub-title" class="field" name="title" placeholder="Fire alarm panel shop drawings" required /></div>
      <div><label class="label" for="sub-spec">Spec section</label><input id="sub-spec" class="field" name="specSection" placeholder="28 31 00" /></div>
      <div><label class="label" for="sub-due">Final due</label><input id="sub-due" class="field" name="dueDate" type="date" /></div>
      <div><label class="label" for="sub-revision">Revision</label><input id="sub-revision" class="field" name="revision" type="number" min="0" value="0" /></div>
      <div><label class="label" for="sub-submit-by">Submit by</label><input id="sub-submit-by" class="field" name="submitBy" type="date" /></div>
      <div class="md:col-span-2"><label class="label" for="sub-owner">Assign to</label><select id="sub-owner" class="field" name="owner"><option value="">Unassigned</option>{#each data.directory as person}<option value={person.id}>{person.name} - {person.organization}</option>{/each}</select></div>
      <div class="md:col-span-2"><label class="label" for="sub-received-from">Received from</label><select id="sub-received-from" class="field" name="receivedFrom"><option value="">Not received</option>{#each data.directory.filter((person) => person.contactType !== 'external') as person}<option value={person.id}>{person.name} - {person.organization}</option>{/each}</select></div>
      <div class="md:col-span-2 xl:col-span-5">
        <label class="label" for="sub-routing">Workflow reviewers</label>
        <select id="sub-routing" class="field multi-select" name="routingAssigneeIds" multiple size={Math.min(6, Math.max(3, data.directory.length))}>
          {#each data.directory.filter((person) => person.contactType !== 'external') as person}
            <option value={person.id}>{person.name} - {person.organization}</option>
          {/each}
        </select>
      </div>
      <div class="md:col-span-2 xl:col-span-3"><label class="label" for="sub-notes">Notes</label><input id="sub-notes" class="field" name="notes" placeholder="Routing notes, upload reference, or decision context" /></div>
      {#if canAttachFiles}
        <div class="md:col-span-2 xl:col-span-5">
          <AttachmentFields files={data.files} idPrefix="new-submittal" uploadLabel="Upload submittal files" existingLabel="Attach existing project files" />
        </div>
      {/if}
      <label class="notify-check md:col-span-2 xl:col-span-4" for="sub-send-emails">
        <input id="sub-send-emails" name="sendEmails" type="checkbox" checked />
        <Bell size={15} />
        <span>Create and send workflow emails</span>
      </label>
      <div class="flex items-end"><button class="btn btn-primary w-full" type="submit"><Check size={16} />Create</button></div>
    </form>
  {/if}

  {#if selectedSubmittal}
    <section class="tracking-panel submittal-detail-panel">
      <div class="submittal-detail-header">
        <div>
          <span class="eyebrow">Selected submittal</span>
          <h2>{selectedSubmittal.number} {selectedSubmittal.title}</h2>
        </div>
        <div class="submittal-status-stack">
          <StatusPill label={selectedSubmittal.status} />
          <span class="readonly-chip">Rev. {selectedSubmittal.revision ?? 0}</span>
        </div>
      </div>

      <div class="submittal-detail-grid">
        <div class="submittal-facts" aria-label="Submittal details">
          <div>
            <span>Spec section</span>
            <strong>{selectedSubmittal.specSection || '-'}</strong>
          </div>
          <div>
            <span>Ball in court</span>
            <strong>{selectedSubmittal.owner || 'Unassigned'}</strong>
          </div>
          <div>
            <span>Submit by</span>
            <strong>{formatDate(selectedSubmittal.submitBy)}</strong>
          </div>
          <div>
            <span>Final due</span>
            <strong>{formatDate(selectedSubmittal.dueDate)}</strong>
          </div>
          <div>
            <span>Received from</span>
            <strong>{selectedSubmittal.receivedFrom || '-'}</strong>
          </div>
          <div>
            <span>Route</span>
            <strong>{routeSummary(selectedSubmittal)}</strong>
          </div>
        </div>

        <div class="workflow-strip" aria-label="Submittal workflow">
          <div class="workflow-strip-title">
            <span class="eyebrow">Workflow</span>
            <span>{routedCount(selectedSubmittal)} routed</span>
          </div>
          {#if selectedSubmittal.routingSteps?.length}
            <ol class="workflow-stepper">
              {#each selectedSubmittal.routingSteps as step}
                <li class={`workflow-step ${stepState(step, selectedSubmittal)}`}>
                  <span class="step-marker">
                    {#if step.status === 'Approved'}<Check size={13} />{:else}{step.order + 1}{/if}
                  </span>
                  <div>
                    <strong>{step.assignee}</strong>
                    <span>{step.role} - {step.status} - Due {formatDate(step.dueDate)}</span>
                    {#if step.response}<p>{step.response}</p>{/if}
                  </div>
                </li>
              {/each}
            </ol>
          {:else if selectedSubmittal.routing.length}
            <ol class="workflow-stepper">
              {#each selectedSubmittal.routing as route, index}
                <li class="workflow-step waiting">
                  <span class="step-marker">{index + 1}</span>
                  <div>
                    <strong>{route}</strong>
                    <span>Route sequence</span>
                  </div>
                </li>
              {/each}
            </ol>
          {:else}
            <div class="workflow-empty">No reviewers routed yet.</div>
          {/if}
        </div>
      </div>

      <div class="item-attachments">
        <span class="eyebrow">Attachments</span>
        <AttachmentChips
          attachments={selectedSubmittal.attachments ?? []}
          emptyLabel="No files attached to this submittal yet."
          downloadAllHref={selectedSubmittal.id
            ? `/api/projects/${encodeURIComponent(data.project?.id ?? '')}/attachments/submittal/${encodeURIComponent(selectedSubmittal.id)}/download`
            : ''}
        />
      </div>
      {#if selectedSubmittal.id && canReviewCommunication}
        <form class="tracking-form" method="post" action="?/updateSubmittal" enctype="multipart/form-data" use:enhance>
          <input type="hidden" name="id" value={selectedSubmittal.id} />
          <label class="tracking-field">
            <span>Status</span>
            <select class="field compact" name="status" bind:value={decisionStatus} aria-label="Submittal decision">
              <option value="submitted">Submitted</option>
              <option value="in_review">In Review</option>
              <option value="approved">Approved</option>
              <option value="revise_resubmit">Revise & Resubmit</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label class="tracking-field decision-field">
            <span>Decision note</span>
            <input class="field" name="decision" placeholder="Decision note or routing update" />
          </label>
          <label class="tracking-field">
            <span>Next ball in court</span>
            <select class="field compact" name="workflowAssigneeId" aria-label="Next workflow assignee">
              <option value="">Keep current</option>
              {#each data.directory.filter((person) => person.contactType !== 'external') as person}
                <option value={person.id} selected={person.id === selectedSubmittal.ownerId}>{person.name}</option>
              {/each}
            </select>
          </label>
          <label class="tracking-field">
            <span>Step due</span>
            <input class="field compact" name="stepDueDate" type="date" value={selectedSubmittal.dueDate ?? ''} />
          </label>
          <label class="notify-check compact-notify" for="sub-update-send-emails">
            <input id="sub-update-send-emails" name="sendEmails" type="checkbox" checked />
            <Bell size={15} />
            <span>Update and send workflow emails</span>
          </label>
          {#if canAttachFiles}
            <details class="tracking-attachment-fields attachment-details">
              <summary>Manage tracking files</summary>
              {#if selectedSubmittal.attachments?.some((attachment) => attachment.id)}
                <fieldset class="remove-attachments">
                  <legend>Remove existing files</legend>
                  {#each selectedSubmittal.attachments.filter((attachment) => attachment.id) as attachment}
                    <label>
                      <input name="removeAttachmentIds" type="checkbox" value={attachment.id} />
                      <span>{attachment.name}</span>
                    </label>
                  {/each}
                </fieldset>
              {/if}
              <AttachmentFields
                files={data.files}
                idPrefix={`submittal-${selectedSubmittal.id}-attachments`}
                uploadLabel="Upload tracking files"
                existingLabel="Attach existing files"
              />
            </details>
          {/if}
          <button class="btn btn-primary" type="submit"><PencilLine size={16} />Save update</button>
        </form>
      {/if}
    </section>
  {/if}

  <section class="workbench workflow-workbench">
    <div class="log-area">
      <div class="log-toolbar">
        <div class="searchbox">
          <Search size={16} />
          <input bind:value={query} placeholder="Search" />
        </div>
        <button class="filter-button" type="button" onclick={clearFilters} disabled={!query && savedView === 'all'} title="Clear filters">
          <X size={14} />
          Clear
        </button>
        <select class="field compact" aria-label="Status filter" bind:value={savedView}>
          <option value="all">All statuses</option>
          <option value="open">Open ({openCount})</option>
          <option value="closed">Closed ({closedCount})</option>
          <option value="ball">Ball in Court ({ballCount})</option>
        </select>
        <span class="result-count">{filteredSubmittals.length} shown</span>
      </div>

      <div class="dense-table-shell">
        <table class="dense-table workflow-table">
          <thead>
            <tr>
              <th>Submittal</th>
              <th>Spec</th>
              <th>Status</th>
              <th>Rev.</th>
              <th>Ball In Court</th>
              <th>Received From</th>
              <th>Files</th>
              <th>Submit By</th>
              <th>Final Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredSubmittals as sub}
              <tr class:active-row={(selectedSubmittal?.id ?? selectedSubmittal?.number) === (sub.id ?? sub.number)} onclick={() => selectSubmittal(sub)}>
                <td>
                  <button class="submittal-record-button" type="button" onclick={(event) => selectSubmittalButton(event, sub)} aria-label={`Open ${sub.number}`}>
                    <span>{sub.number}</span>
                    <strong>{sub.title}</strong>
                  </button>
                </td>
                <td>{sub.specSection || '-'}</td>
                <td><StatusPill label={sub.status} /></td>
                <td>{sub.revision ?? 0}</td>
                <td>{sub.owner || 'Unassigned'}</td>
                <td>{sub.receivedFrom || '-'}</td>
                <td>{sub.attachments?.length ?? 0}</td>
                <td>{formatDate(sub.submitBy)}</td>
                <td>{formatDate(sub.dueDate)}</td>
                <td>
                  <button class="mini-button row-open-button" type="button" onclick={(event) => selectSubmittalButton(event, sub)}>
                    Open
                    <ArrowRight size={13} />
                  </button>
                </td>
              </tr>
            {:else}
              <tr><td colspan="10"><div class="empty-log"><strong>No submittals match this view.</strong><span>Create a submittal or adjust the filters.</span></div></td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>
</PageShell>

<style>
  .workflow-workbench {
    grid-template-columns: minmax(0, 1fr);
  }

  .workflow-table {
    min-width: 0;
    table-layout: fixed;
  }

  .workflow-table th:nth-child(1),
  .workflow-table td:nth-child(1) {
    width: 25%;
  }

  .workflow-table th:nth-child(2),
  .workflow-table td:nth-child(2) {
    width: 7%;
  }

  .workflow-table th:nth-child(3),
  .workflow-table td:nth-child(3) {
    width: 9%;
  }

  .workflow-table th:nth-child(4),
  .workflow-table td:nth-child(4),
  .workflow-table th:nth-child(7),
  .workflow-table td:nth-child(7) {
    width: 5%;
  }

  .workflow-table th:nth-child(5),
  .workflow-table td:nth-child(5),
  .workflow-table th:nth-child(6),
  .workflow-table td:nth-child(6) {
    width: 11%;
  }

  .workflow-table th:nth-child(8),
  .workflow-table td:nth-child(8),
  .workflow-table th:nth-child(9),
  .workflow-table td:nth-child(9) {
    width: 8%;
  }

  .workflow-table th:nth-child(10),
  .workflow-table td:nth-child(10) {
    width: 6%;
  }

  .submittal-record-button {
    display: grid;
    width: 100%;
    gap: 0.14rem;
    border: 0;
    background: transparent;
    padding: 0;
    color: inherit;
    text-align: left;
  }

  .submittal-record-button span {
    color: #1d5fb8;
    font-size: 0.78rem;
    font-weight: 850;
    text-decoration: underline;
  }

  .submittal-record-button strong {
    overflow: hidden;
    color: #191b19;
    font-size: 0.82rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .submittal-record-button:hover strong {
    color: #164f9e;
  }

  .tracking-form {
    grid-template-columns: minmax(10rem, 13rem) minmax(16rem, 1fr) minmax(12rem, 16rem) minmax(9rem, 11rem) auto;
    align-items: end;
    border-top: 1px solid rgba(25, 27, 25, 0.1);
    padding-top: 0.75rem;
  }

  .item-attachments {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.85rem;
  }

  .tracking-attachment-fields {
    grid-column: 1 / -1;
    min-width: 0;
  }

  .attachment-details {
    border-top: 1px solid rgba(25, 27, 25, 0.08);
    padding-top: 0.4rem;
  }

  .attachment-details summary {
    width: fit-content;
    color: #191b19;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .attachment-details[open] summary {
    margin-bottom: 0.55rem;
  }

  .submittal-detail-panel {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  .submittal-detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .submittal-detail-header h2 {
    margin: 0.16rem 0 0;
    color: #191b19;
    font-size: 1rem;
    font-weight: 850;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .submittal-status-stack {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.45rem;
  }

  .submittal-detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(18rem, 0.95fr);
    gap: 0.85rem;
    align-items: start;
  }

  .submittal-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 0.35rem;
    background: #fff;
  }

  .submittal-facts > div {
    display: grid;
    gap: 0.2rem;
    min-height: 3.25rem;
    border-right: 1px solid rgba(25, 27, 25, 0.08);
    border-bottom: 1px solid rgba(25, 27, 25, 0.08);
    padding: 0.52rem 0.6rem;
  }

  .submittal-facts > div:nth-child(3n) {
    border-right: 0;
  }

  .submittal-facts > div:nth-last-child(-n + 3) {
    border-bottom: 0;
  }

  .submittal-facts span,
  .workflow-strip-title span:last-child {
    color: #5c665d;
    font-size: 0.68rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .submittal-facts strong {
    overflow: hidden;
    color: #202520;
    font-size: 0.82rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workflow-strip {
    min-width: 0;
    border-left: 1px solid rgba(25, 27, 25, 0.12);
    padding-left: 0.85rem;
  }

  .workflow-strip-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    margin-bottom: 0.45rem;
  }

  .workflow-stepper {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .workflow-step {
    display: grid;
    grid-template-columns: 1.6rem minmax(0, 1fr);
    gap: 0.55rem;
    border-bottom: 1px solid rgba(25, 27, 25, 0.08);
    padding: 0.48rem 0;
  }

  .workflow-step:first-child {
    padding-top: 0;
  }

  .workflow-step:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .step-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.45rem;
    height: 1.45rem;
    border: 1px solid rgba(25, 27, 25, 0.14);
    border-radius: 999px;
    background: #fff;
    color: #4f594f;
    font-size: 0.72rem;
    font-weight: 850;
  }

  .workflow-step.current .step-marker {
    border-color: #18a53a;
    color: #fff;
    background: #18a53a;
  }

  .workflow-step.complete .step-marker {
    border-color: rgba(24, 165, 58, 0.2);
    color: #147a31;
    background: rgba(29, 175, 63, 0.13);
  }

  .workflow-step.attention .step-marker {
    border-color: rgba(220, 38, 38, 0.18);
    color: #a83333;
    background: rgba(220, 38, 38, 0.1);
  }

  .workflow-step strong,
  .workflow-step span,
  .workflow-step p {
    display: block;
    margin: 0;
    font-size: 0.76rem;
    line-height: 1.35;
  }

  .workflow-step strong {
    overflow: hidden;
    color: #191b19;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workflow-step span,
  .workflow-step p,
  .workflow-empty {
    color: #4f594f;
  }

  .workflow-empty {
    border-top: 1px solid rgba(25, 27, 25, 0.08);
    padding-top: 0.55rem;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .multi-select {
    min-height: 6.2rem;
    padding-block: 0.4rem;
  }

  .remove-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin: 0 0 0.55rem;
    border: 0;
    padding: 0;
  }

  .remove-attachments legend {
    width: 100%;
    color: #4f594f;
    font-size: 0.68rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .remove-attachments label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid rgba(25, 27, 25, 0.12);
    border-radius: 0.35rem;
    background: #fff;
    padding: 0.38rem 0.5rem;
    color: #303830;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .tracking-form .btn {
    white-space: nowrap;
  }

  .tracking-field {
    display: grid;
    gap: 0.28rem;
    min-width: 0;
  }

  .tracking-field span {
    color: #4f594f;
    font-size: 0.68rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .tracking-field .field {
    width: 100%;
  }

  .notify-check {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: #303630;
    font-size: 0.82rem;
    font-weight: 850;
  }

  .notify-check input {
    width: 1rem;
    height: 1rem;
    accent-color: #191b19;
  }

  .compact-notify {
    white-space: nowrap;
    align-self: end;
    min-height: 2.35rem;
  }

  .row-open-button {
    gap: 0.25rem;
    white-space: nowrap;
  }

  .filter-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  @media (max-width: 900px) {
    .workflow-table {
      min-width: 920px;
    }

    .submittal-detail-grid {
      grid-template-columns: 1fr;
    }

    .workflow-strip {
      border-left: 0;
      border-top: 1px solid rgba(25, 27, 25, 0.12);
      padding-top: 0.75rem;
      padding-left: 0;
    }

    .tracking-form {
      grid-template-columns: 1fr;
    }

    .tracking-attachment-fields {
      grid-column: auto;
    }

    .tracking-form .btn {
      width: 100%;
    }

    .compact-notify {
      white-space: normal;
    }
  }

  @media (max-width: 640px) {
    .submittal-detail-header {
      display: grid;
    }

    .submittal-status-stack {
      justify-content: flex-start;
    }

    .submittal-facts {
      grid-template-columns: 1fr;
    }

    .submittal-facts > div,
    .submittal-facts > div:nth-child(3n),
    .submittal-facts > div:nth-last-child(-n + 3) {
      border-right: 0;
      border-bottom: 1px solid rgba(25, 27, 25, 0.08);
    }

    .submittal-facts > div:last-child {
      border-bottom: 0;
    }
  }
</style>
