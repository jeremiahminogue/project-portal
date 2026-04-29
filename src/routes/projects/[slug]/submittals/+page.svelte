<script lang="ts">
  import { enhance } from '$app/forms';
  import { ArrowRight, Bell, Check, Download, FilePlus2, Paperclip, PencilLine, Search, X } from '@lucide/svelte';
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

  const selectedSubmittal = $derived(data.submittals.find((item) => (item.id ?? item.number) === activeSubmittal));

  $effect(() => {
    if (selectedSubmittal) decisionStatus = statusValue(selectedSubmittal.status);
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

  function openSubmittalModal(submittal: PortalSubmittal) {
    activeSubmittal = submittalKey(submittal);
  }

  function closeSubmittalModal() {
    activeSubmittal = '';
  }

  function stopModalClick(event: MouseEvent) {
    event.stopPropagation();
  }

  function openSubmittalButton(event: MouseEvent, submittal: PortalSubmittal) {
    event.stopPropagation();
    openSubmittalModal(submittal);
  }

  function stopRowAction(event: MouseEvent) {
    event.stopPropagation();
  }

  function submittalDownloadHref(submittal: PortalSubmittal) {
    const downloadable = (submittal.attachments ?? []).filter((attachment) => attachment.id);
    if (downloadable.length === 1) {
      return `/api/files/${encodeURIComponent(downloadable[0].id ?? '')}/download?download=1`;
    }
    if (downloadable.length > 1 && submittal.id) {
      return `/api/projects/${encodeURIComponent(data.project?.id ?? '')}/attachments/submittal/${encodeURIComponent(submittal.id)}/download`;
    }
    return '';
  }

  function attachmentLabel(submittal: PortalSubmittal) {
    const count = submittal.attachments?.length ?? 0;
    if (count === 0) return 'None';
    return `${count} file${count === 1 ? '' : 's'}`;
  }

  function attachmentTitle(submittal: PortalSubmittal) {
    return submittal.attachments?.map((attachment) => attachment.path ?? attachment.name).join('\n') || 'No files attached';
  }

  function handleModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && selectedSubmittal) closeSubmittalModal();
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

<svelte:window onkeydown={handleModalKeydown} />

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
              <tr class:active-row={(selectedSubmittal?.id ?? selectedSubmittal?.number) === (sub.id ?? sub.number)} onclick={() => openSubmittalModal(sub)}>
                <td>
                  <button class="submittal-record-button" type="button" onclick={(event) => openSubmittalButton(event, sub)} aria-label={`Open ${sub.number}`}>
                    <span>{sub.number}</span>
                    <strong>{sub.title}</strong>
                  </button>
                </td>
                <td>{sub.specSection || '-'}</td>
                <td><StatusPill label={sub.status} /></td>
                <td>{sub.revision ?? 0}</td>
                <td>{sub.owner || 'Unassigned'}</td>
                <td>{sub.receivedFrom || '-'}</td>
                <td>
                  {#if sub.attachments?.length}
                    {#if submittalDownloadHref(sub)}
                      <a class="file-count-link" href={submittalDownloadHref(sub)} title={attachmentTitle(sub)} onclick={stopRowAction}>
                        <Paperclip size={13} />
                        <span>{attachmentLabel(sub)}</span>
                        <Download size={12} />
                      </a>
                    {:else}
                      <span class="file-count-static" title={attachmentTitle(sub)}>
                        <Paperclip size={13} />
                        <span>{attachmentLabel(sub)}</span>
                      </span>
                    {/if}
                  {:else}
                    <span class="file-empty">None</span>
                  {/if}
                </td>
                <td>{formatDate(sub.submitBy)}</td>
                <td>{formatDate(sub.dueDate)}</td>
                <td>
                  <button class="mini-button row-open-button" type="button" onclick={(event) => openSubmittalButton(event, sub)}>
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

{#if selectedSubmittal}
  <div class="modal-backdrop" role="presentation" onclick={closeSubmittalModal}>
      <div class="workflow-modal" role="dialog" aria-modal="true" aria-labelledby="submittal-modal-title" tabindex="-1" onclick={stopModalClick} onkeydown={handleModalKeydown}>
        <header class="modal-header">
          <div>
            <span class="eyebrow">Submittal review</span>
            <h2 id="submittal-modal-title">{selectedSubmittal.number} {selectedSubmittal.title}</h2>
          </div>
          <div class="modal-header-actions">
            <StatusPill label={selectedSubmittal.status} />
            <button class="icon-row-button" type="button" aria-label="Close submittal" onclick={closeSubmittalModal}>
              <X size={17} />
            </button>
          </div>
        </header>

        <div class="modal-body">
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
                <span>Revision</span>
                <strong>{selectedSubmittal.revision ?? 0}</strong>
              </div>
              <div>
                <span>Submit by</span>
                <strong>{formatDate(selectedSubmittal.submitBy)}</strong>
              </div>
              <div>
                <span>Received from</span>
                <strong>{selectedSubmittal.receivedFrom || '-'}</strong>
              </div>
              <div>
                <span>Final due</span>
                <strong>{formatDate(selectedSubmittal.dueDate)}</strong>
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
            <span class="eyebrow">Current attachments</span>
            <AttachmentChips
              attachments={selectedSubmittal.attachments ?? []}
              emptyLabel="No files attached to this submittal yet."
              downloadAllHref={selectedSubmittal.id
                ? `/api/projects/${encodeURIComponent(data.project?.id ?? '')}/attachments/submittal/${encodeURIComponent(selectedSubmittal.id)}/download`
                : ''}
            />
          </div>

          {#if selectedSubmittal.id && canReviewCommunication}
            <form class="modal-form" method="post" action="?/updateSubmittal" enctype="multipart/form-data" use:enhance>
              <input type="hidden" name="id" value={selectedSubmittal.id} />
              <label class="tracking-field">
                <span>Status</span>
                <select class="field" name="status" bind:value={decisionStatus} aria-label="Submittal decision">
                  <option value="submitted">Submitted</option>
                  <option value="in_review">In Review</option>
                  <option value="approved">Approved</option>
                  <option value="revise_resubmit">Revise & Resubmit</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label class="tracking-field response-field">
                <span>Response</span>
                <textarea class="field min-h-28" name="decision" placeholder="Record the review response, decision notes, or routing update"></textarea>
              </label>
              <label class="tracking-field">
                <span>Next ball in court</span>
                <select class="field" name="workflowAssigneeId" aria-label="Next workflow assignee">
                  <option value="">Keep current</option>
                  {#each data.directory.filter((person) => person.contactType !== 'external') as person}
                    <option value={person.id} selected={person.id === selectedSubmittal.ownerId}>{person.name}</option>
                  {/each}
                </select>
              </label>
              <label class="tracking-field">
                <span>Step due</span>
                <input class="field" name="stepDueDate" type="date" value={selectedSubmittal.dueDate ?? ''} />
              </label>
              <label class="notify-check modal-notify" for="sub-update-send-emails">
                <input id="sub-update-send-emails" name="sendEmails" type="checkbox" checked />
                <Bell size={15} />
                <span>Update and send workflow emails</span>
              </label>
              {#if canAttachFiles}
                <details class="modal-attachment-fields">
                  <summary>Attach or remove files</summary>
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
                    uploadLabel="Upload response files"
                    existingLabel="Attach existing files"
                  />
                </details>
              {/if}
              <div class="modal-footer">
                <button class="btn btn-secondary" type="button" onclick={closeSubmittalModal}>Cancel</button>
                <button class="btn btn-primary" type="submit"><PencilLine size={16} />Save update</button>
              </div>
            </form>
          {/if}
        </div>
      </div>
  </div>
{/if}

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
  .workflow-table td:nth-child(4) {
    width: 5%;
  }

  .workflow-table th:nth-child(7),
  .workflow-table td:nth-child(7) {
    width: 7%;
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

  .file-count-link,
  .file-count-static {
    display: inline-flex;
    align-items: center;
    gap: 0.28rem;
    max-width: 100%;
    border-radius: 0.35rem;
    color: #22532b;
    font-size: 0.74rem;
    font-weight: 850;
    line-height: 1;
    white-space: nowrap;
  }

  .file-count-link {
    border: 1px solid rgba(55, 95, 56, 0.18);
    background: rgba(55, 95, 56, 0.08);
    padding: 0.32rem 0.42rem;
    text-decoration: none;
  }

  .file-count-link:hover {
    border-color: rgba(55, 95, 56, 0.34);
    background: rgba(55, 95, 56, 0.14);
  }

  .file-count-link span,
  .file-count-static span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-empty {
    color: #727a72;
    font-size: 0.74rem;
    font-weight: 750;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: rgba(15, 17, 15, 0.38);
    padding: 1.25rem;
    backdrop-filter: blur(10px);
  }

  .workflow-modal {
    display: grid;
    width: min(980px, 100%);
    max-height: min(92vh, 980px);
    overflow: hidden;
    border: 1px solid rgba(25, 27, 25, 0.16);
    border-radius: 0.45rem;
    background: #fff;
    box-shadow: 0 28px 90px -42px rgba(0, 0, 0, 0.65);
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(25, 27, 25, 0.1);
    padding: 0.9rem 1rem;
  }

  .modal-header h2 {
    margin: 0.16rem 0 0;
    color: #191b19;
    font-size: 1.05rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .modal-header-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .modal-body {
    display: grid;
    gap: 0.9rem;
    overflow: auto;
    padding: 1rem;
  }

  .modal-form {
    display: grid;
    grid-template-columns: minmax(10rem, 13rem) minmax(12rem, 1fr) minmax(12rem, 15rem) minmax(9rem, 11rem);
    gap: 0.65rem;
    border-top: 1px solid rgba(25, 27, 25, 0.1);
    padding-top: 0.85rem;
  }

  .response-field,
  .modal-attachment-fields,
  .modal-footer {
    grid-column: 1 / -1;
  }

  .modal-notify {
    grid-column: 1 / -1;
  }

  .modal-attachment-fields {
    min-width: 0;
    border-top: 1px solid rgba(25, 27, 25, 0.08);
    padding-top: 0.45rem;
  }

  .modal-attachment-fields summary {
    width: fit-content;
    color: #191b19;
    font-size: 0.82rem;
    font-weight: 850;
  }

  .modal-attachment-fields[open] summary {
    margin-bottom: 0.6rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.55rem;
    border-top: 1px solid rgba(25, 27, 25, 0.08);
    padding-top: 0.8rem;
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

    .compact-notify {
      white-space: normal;
    }

    .modal-form {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
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

    .modal-backdrop {
      align-items: end;
      padding: 0;
    }

    .workflow-modal {
      width: 100%;
      max-height: 92vh;
      border-radius: 0.45rem 0.45rem 0 0;
    }

    .modal-header {
      align-items: flex-start;
      padding: 0.8rem;
    }

    .modal-body {
      padding: 0.8rem;
    }

    .modal-footer {
      display: grid;
    }
  }
</style>
