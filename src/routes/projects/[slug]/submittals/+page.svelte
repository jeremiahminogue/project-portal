<!--
  Submittals page.

  Detail modal is timeline-as-spine:
    - Opens narrow (no preview pane). File rail sits at the top of the
      control pane; clicking a chip mounts the preview pane and widens
      the modal. Clicking the active chip again closes the preview.
    - Routing timeline carries Approve / Revise / Reject / In review
      inline on the *current* step only. Picking one arms a single
      action drawer (response + next BIC + step due + files + email
      toggle) which posts to ?/updateSubmittal.
    - Edit details still uses the same action with editTitle/editSpec…
      prefixed fields. Mutually exclusive with the action drawer.
    - Create modal stays small and compact (~620×720) with the existing-
      files picker collapsed (AttachmentFields existingCollapsed).
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import {
    ArrowRight,
    Bell,
    Check,
    ChevronDown,
    ChevronUp,
    Download,
    Eye,
    FileText,
    FilePlus2,
    Image as ImageIcon,
    Paperclip,
    PencilLine,
    Plus,
    RotateCcw,
    Search,
    Trash2,
    X,
    XCircle
  } from '@lucide/svelte';
  import type { SubmitFunction } from '@sveltejs/kit';
  import AttachmentFields from '$lib/components/AttachmentFields.svelte';
  import EmbedPdfViewer from '$lib/components/EmbedPdfViewer.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  type SubmittalRoutingStep = {
    id?: string;
    order: number;
    assignee: string;
    assigneeId?: string | null;
    role: string;
    status: string;
    dueDate?: string | null;
    response?: string | null;
    completedAt?: string | null;
  };

  type SubmittalAttachment = { id?: string; name: string; size: string; type: string; path?: string };

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
    receivedFromId?: string | null;
    submittedBy?: string | null;
    submittedById?: string | null;
    notes?: string | null;
    decision?: string | null;
    routing: string[];
    routingSteps?: SubmittalRoutingStep[];
    currentStep?: number;
    attachments?: SubmittalAttachment[];
  };

  type RoutingRow = { assigneeId: string; dueDate: string };

  let { data, form } = $props();

  // ── UI state ──────────────────────────────────────────────────
  let showCreateModal = $state(false);
  let activeSubmittal = $state('');
  let query = $state('');
  let savedView = $state('all');
  let decisionStatus = $state('in_review');
  let decisionResponse = $state('');
  let decisionArmed = $state(false);
  let editing = $state(false);
  let activeAttachmentId = $state('');
  let newSubmittalNumber = $state('');
  let routingRows = $state<RoutingRow[]>([{ assigneeId: '', dueDate: '' }]);
  let routingSetupRows = $state<RoutingRow[]>([{ assigneeId: '', dueDate: '' }]);

  const decisionLabels: Record<string, string> = {
    in_review: 'Mark in review',
    approved: 'Approve',
    revise_resubmit: 'Revise & resubmit',
    rejected: 'Reject'
  };

  // ── Permissions (proxied from server payload) ────────────────
  const canCreateCommunication = $derived(data.communicationAccess?.canCreate ?? true);
  const canReviewCommunication = $derived(data.communicationAccess?.canReview ?? true);
  const canAttachFiles = $derived(data.communicationAccess?.canAttachFiles ?? true);
  const canDeleteCommunication = $derived(
    data.communicationAccess?.role === 'superadmin' || data.communicationAccess?.role === 'admin'
  );
  // Submittal managers + admins/superadmins can plan the routing chain. Other
  // members upload and the chain gets set by a manager from the detail modal.
  const canRouteSubmittals = $derived(
    data.communicationAccess?.isSubmittalManager === true ||
      data.communicationAccess?.role === 'admin' ||
      data.communicationAccess?.role === 'superadmin'
  );
  const submittalManagerIds = $derived<string[]>(data.communicationAccess?.submittalManagerIds ?? []);
  const submittalManagerNames = $derived(
    submittalManagerIds
      .map((id) => data.directory.find((person) => person.id === id)?.name)
      .filter((name): name is string => Boolean(name))
  );
  const submittalManagerLabel = $derived(
    submittalManagerNames.length === 0
      ? 'a submittal manager'
      : submittalManagerNames.length === 1
        ? submittalManagerNames[0]
        : `${submittalManagerNames[0]} (+${submittalManagerNames.length - 1})`
  );

  // ── Counters / filters ───────────────────────────────────────
  const openCount = $derived(data.submittals.filter((item) => !isClosedStatus(item.status)).length);
  const closedCount = $derived(data.submittals.filter((item) => isClosedStatus(item.status)).length);
  const ballCount = $derived(data.submittals.filter((item) => item.owner).length);

  const filteredSubmittals = $derived(
    data.submittals.filter((item) => {
      const queryOk =
        !query ||
        `${item.number} ${item.title} ${item.specSection ?? ''} ${item.owner ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase());
      const viewOk =
        savedView === 'all' ||
        (savedView === 'open' && !['Approved', 'Rejected'].includes(item.status)) ||
        (savedView === 'closed' && ['Approved', 'Rejected'].includes(item.status)) ||
        (savedView === 'ball' && item.owner);
      return queryOk && viewOk;
    })
  );

  const selectedSubmittal = $derived(data.submittals.find((item) => (item.id ?? item.number) === activeSubmittal));
  const selectedAttachments = $derived(selectedSubmittal?.attachments ?? []);
  const previewAttachment = $derived(
    activeAttachmentId
      ? selectedAttachments.find((attachment) => (attachment.id ?? attachment.name) === activeAttachmentId) ?? null
      : null
  );
  const currentStepOrder = $derived(selectedSubmittal?.currentStep ?? 0);
  const isWorkflowClosed = $derived(selectedSubmittal ? isClosedStatus(selectedSubmittal.status) : false);
  const nextRoutingStep = $derived(
    selectedSubmittal?.routingSteps?.find((step) => step.order === currentStepOrder + 1) ?? null
  );
  const isFinalRoutingStep = $derived(
    !!selectedSubmittal?.routingSteps?.length && !nextRoutingStep
  );

  // ── Per-submittal actor gates (mirror server updateSubmittal) ──
  // isAdmin     - admin / superadmin: anything goes
  // isBic       - existing.owner === user OR current step assignee === user
  // isSubmitter - existing.submitted_by === user
  const currentUserId = $derived(data.communicationAccess?.userId ?? null);
  const isAdminLike = $derived(
    data.communicationAccess?.role === 'admin' || data.communicationAccess?.role === 'superadmin'
  );
  function isBicFor(submittal: PortalSubmittal | undefined | null) {
    if (!submittal || !currentUserId) return false;
    if (submittal.ownerId && submittal.ownerId === currentUserId) return true;
    const stepIndex = submittal.currentStep ?? 0;
    const stepAssignee = submittal.routingSteps?.find((step) => step.order === stepIndex)?.assigneeId;
    return Boolean(stepAssignee && stepAssignee === currentUserId);
  }
  function isSubmitterOf(submittal: PortalSubmittal | undefined | null) {
    if (!submittal || !currentUserId) return false;
    return Boolean(submittal.submittedById && submittal.submittedById === currentUserId);
  }
  const canWorkflowSelected = $derived(
    Boolean(selectedSubmittal) && (isAdminLike || isBicFor(selectedSubmittal))
  );
  const canEditSelected = $derived(
    Boolean(selectedSubmittal) && (isAdminLike || isSubmitterOf(selectedSubmittal))
  );
  const canActOnSelected = $derived(canWorkflowSelected || canEditSelected);
  const canRemoveAttachments = $derived(isAdminLike);

  // ── Reactive resets ──────────────────────────────────────────
  $effect(() => {
    if (selectedSubmittal) {
      decisionStatus = statusValue(selectedSubmittal.status);
      decisionResponse = '';
      decisionArmed = false;
      editing = false;
      activeAttachmentId = '';
      routingSetupRows = [{ assigneeId: '', dueDate: '' }];
    }
  });

  function addRoutingSetupRow() {
    routingSetupRows = [...routingSetupRows, { assigneeId: '', dueDate: '' }];
  }
  function removeRoutingSetupRow(index: number) {
    routingSetupRows = routingSetupRows.filter((_, i) => i !== index);
    if (routingSetupRows.length === 0) routingSetupRows = [{ assigneeId: '', dueDate: '' }];
  }
  function moveRoutingSetupRow(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= routingSetupRows.length) return;
    const next = [...routingSetupRows];
    [next[index], next[target]] = [next[target], next[index]];
    routingSetupRows = next;
  }

  // ── Helpers ──────────────────────────────────────────────────
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

  function isClosedStatus(status: string) {
    return status === 'Approved' || status === 'Rejected';
  }

  function clearFilters() {
    query = '';
    savedView = 'all';
  }

  function submittalKey(submittal: PortalSubmittal) {
    return submittal.id ?? submittal.number;
  }

  function openSubmittalModal(submittal: PortalSubmittal) {
    activeSubmittal = submittalKey(submittal);
  }

  function closeSubmittalModal() {
    activeSubmittal = '';
    editing = false;
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

  function confirmDelete(event: SubmitEvent, submittal: PortalSubmittal) {
    event.stopPropagation();
    if (!confirm(`Delete submittal ${submittal.number} - ${submittal.title}? This cannot be undone.`)) {
      event.preventDefault();
    }
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
    if (event.key === 'Escape') {
      if (selectedSubmittal) closeSubmittalModal();
      else if (showCreateModal) closeCreateModal();
    }
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

  function openCreateModal() {
    showCreateModal = true;
    newSubmittalNumber = '';
    routingRows = [{ assigneeId: '', dueDate: '' }];
  }

  function closeCreateModal() {
    showCreateModal = false;
    newSubmittalNumber = '';
    routingRows = [{ assigneeId: '', dueDate: '' }];
  }

  function addRoutingRow() {
    routingRows = [...routingRows, { assigneeId: '', dueDate: '' }];
  }

  function removeRoutingRow(index: number) {
    routingRows = routingRows.filter((_, i) => i !== index);
    if (routingRows.length === 0) routingRows = [{ assigneeId: '', dueDate: '' }];
  }

  function moveRoutingRow(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= routingRows.length) return;
    const next = [...routingRows];
    [next[index], next[target]] = [next[target], next[index]];
    routingRows = next;
  }

  function previewType(attachment: SubmittalAttachment | null): 'pdf' | 'image' | 'other' {
    if (!attachment) return 'other';
    const lowerName = attachment.name.toLowerCase();
    const lowerType = attachment.type.toLowerCase();
    if (/\.pdf$/i.test(lowerName) || lowerType.includes('pdf')) return 'pdf';
    if (/\.(png|jpe?g|webp|gif|svg)$/i.test(lowerName) || lowerType.startsWith('image/')) return 'image';
    return 'other';
  }

  function previewSrc(attachment: SubmittalAttachment | null) {
    if (!attachment?.id) return '';
    return `/api/files/${encodeURIComponent(attachment.id)}/download`;
  }

  function fileChipClasses(attachment: SubmittalAttachment) {
    const active = (attachment.id ?? attachment.name) === (previewAttachment?.id ?? previewAttachment?.name);
    return active ? 'file-chip is-active' : 'file-chip';
  }

  function armDecision(status: 'in_review' | 'approved' | 'revise_resubmit' | 'rejected') {
    decisionStatus = status;
    decisionArmed = true;
    editing = false;
    if (!decisionResponse?.trim()) {
      const defaults: Record<string, string> = {
        in_review: 'Marked in review.',
        approved: 'Approved as submitted.',
        revise_resubmit: 'Revise and resubmit. See comments above.',
        rejected: 'Rejected. See comments above.'
      };
      decisionResponse = defaults[status];
    }
  }

  function cancelDecision() {
    decisionArmed = false;
    decisionResponse = '';
    if (selectedSubmittal) decisionStatus = statusValue(selectedSubmittal.status);
  }

  function toggleAttachmentPreview(attachment: SubmittalAttachment) {
    const key = attachment.id ?? attachment.name;
    activeAttachmentId = activeAttachmentId === key ? '' : key;
  }

  function isCurrentStep(step: SubmittalRoutingStep) {
    return step.order === currentStepOrder && !isWorkflowClosed;
  }

  // Form submit helpers — close modals on success
  const resetOnSuccess =
    (after?: () => void): SubmitFunction =>
    () => {
      return async ({ result, update }) => {
        await update({ reset: result.type === 'success' });
        if (result.type === 'success') after?.();
      };
    };
</script>

<svelte:head>
  <title>Submittals | {data.project?.title}</title>
</svelte:head>

<svelte:window onkeydown={handleModalKeydown} />

<PageShell wide>
  <section class="tool-heading">
    <div class="min-w-0">
      <h1>Submittals</h1>
      <p>Create, route, and respond to submittal packages without dragging the rest of the project file tree along.</p>
      <div class="tool-tabs" aria-label="Submittal sections">
        <button class:active={savedView === 'all'} type="button" onclick={() => (savedView = 'all')}>Items ({data.submittals.length})</button>
        <button class:active={savedView === 'ball'} type="button" onclick={() => (savedView = 'ball')}>Ball In Court ({ballCount})</button>
        <button class:active={savedView === 'open'} type="button" onclick={() => (savedView = 'open')}>Open ({openCount})</button>
        <button class:active={savedView === 'closed'} type="button" onclick={() => (savedView = 'closed')}>Closed ({closedCount})</button>
      </div>
    </div>
    {#if canCreateCommunication}
      <div class="tool-actions">
        <button class="btn btn-primary" type="button" onclick={openCreateModal}>
          <FilePlus2 size={16} />New submittal
        </button>
      </div>
    {/if}
  </section>

  {#if form?.error}
    <div class="banner-error">{form.error}</div>
  {/if}
  {#if form?.ok}
    <div class="banner-ok">Saved.</div>
  {/if}

  <section class="workbench workflow-workbench">
    <div class="log-area">
      <div class="log-toolbar">
        <div class="searchbox">
          <Search size={16} />
          <input bind:value={query} placeholder="Search submittals" />
        </div>
        <button class="filter-button" type="button" onclick={clearFilters} disabled={!query && savedView === 'all'} title="Clear filters">
          <X size={14} />
          Clear
        </button>
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
                    <span class="submittal-number">{sub.number}</span>
                    <strong class="submittal-title">{sub.title}</strong>
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
                  <div class="row-actions">
                    <button class="row-icon-btn" type="button" aria-label={`Open ${sub.number}`} title="Open" onclick={(event) => openSubmittalButton(event, sub)}>
                      <Eye size={14} />
                    </button>
                    {#if canDeleteCommunication && sub.id}
                      <form method="post" action="?/deleteSubmittal" use:enhance onsubmit={(event) => confirmDelete(event, sub)}>
                        <input type="hidden" name="id" value={sub.id} />
                        <button class="row-icon-btn is-danger" type="submit" aria-label={`Delete ${sub.number}`} title="Delete submittal" onclick={stopRowAction}>
                          <Trash2 size={14} />
                        </button>
                      </form>
                    {/if}
                  </div>
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

<!-- ────────── Create modal ────────── -->
{#if showCreateModal && canCreateCommunication}
  <div class="modal-backdrop" role="presentation" onclick={closeCreateModal}>
    <div class="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-modal-title" tabindex="-1" onclick={stopModalClick} onkeydown={handleModalKeydown}>
      <header class="modal-header">
        <div>
          <span class="eyebrow">New submittal</span>
          <h2 id="create-modal-title">Create and route a submittal</h2>
        </div>
        <button class="icon-row-button" type="button" aria-label="Close" onclick={closeCreateModal}>
          <X size={17} />
        </button>
      </header>

      <form
        class="modal-body create-form"
        method="post"
        action="?/createSubmittal"
        enctype="multipart/form-data"
        use:enhance={resetOnSuccess(closeCreateModal)}
      >
        <div class="field-row two">
          <label class="field-label">
            <span>Number<i>*</i></span>
            <input class="field" name="number" placeholder="1646-001" bind:value={newSubmittalNumber} required />
          </label>
          <label class="field-label rev">
            <span>Rev.</span>
            <input class="field" name="revision" type="number" min="0" value="0" />
          </label>
        </div>

        <label class="field-label">
          <span>Title<i>*</i></span>
          <input class="field" name="title" placeholder="Fire alarm panel shop drawings" required />
        </label>

        <div class="field-row two">
          <label class="field-label">
            <span>Spec section</span>
            <input class="field" name="specSection" placeholder="28 31 00" />
          </label>
          <label class="field-label">
            <span>Submit by</span>
            <input class="field" name="submitBy" type="date" />
          </label>
        </div>

        <div class="field-row two">
          <label class="field-label">
            <span>Final due</span>
            <input class="field" name="dueDate" type="date" />
          </label>
          <label class="field-label">
            <span>Ball in court</span>
            <select class="field" name="owner">
              <option value="">Unassigned</option>
              {#each data.directory as person}
                <option value={person.id}>{person.name} - {person.organization}</option>
              {/each}
            </select>
          </label>
        </div>

        <label class="field-label">
          <span>Received from</span>
          <select class="field" name="receivedFrom">
            <option value="">Not received</option>
            {#each data.directory.filter((person) => person.contactType !== 'external') as person}
              <option value={person.id}>{person.name} - {person.organization}</option>
            {/each}
          </select>
        </label>

        {#if canRouteSubmittals}
          <div class="field-label routing-block">
            <span>Workflow reviewers (in order)</span>
            <div class="routing-rows">
              {#each routingRows as row, index (index)}
                <div class="routing-row">
                  <span class="routing-step-marker" aria-hidden="true">{index + 1}</span>
                  <select
                    class="field"
                    name="routingAssigneeIds"
                    bind:value={row.assigneeId}
                    aria-label={`Reviewer ${index + 1}`}
                  >
                    <option value="">Pick reviewer</option>
                    {#each data.directory.filter((person) => person.contactType !== 'external') as person}
                      <option value={person.id}>{person.name} - {person.organization}</option>
                    {/each}
                  </select>
                  <input
                    class="field routing-due"
                    name="routingDueDates"
                    type="date"
                    bind:value={row.dueDate}
                    aria-label={`Due date for step ${index + 1}`}
                  />
                  <div class="routing-row-actions">
                    <button type="button" class="row-icon-btn" aria-label="Move up" title="Move up" disabled={index === 0} onclick={() => moveRoutingRow(index, -1)}>
                      <ChevronUp size={13} />
                    </button>
                    <button type="button" class="row-icon-btn" aria-label="Move down" title="Move down" disabled={index === routingRows.length - 1} onclick={() => moveRoutingRow(index, 1)}>
                      <ChevronDown size={13} />
                    </button>
                    <button type="button" class="row-icon-btn is-danger" aria-label="Remove reviewer" title="Remove" onclick={() => removeRoutingRow(index)} disabled={routingRows.length === 1 && !row.assigneeId && !row.dueDate}>
                      <X size={13} />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
            <button type="button" class="routing-add" onclick={addRoutingRow}>
              <Plus size={13} />Add reviewer
            </button>
            <small class="hint">First reviewer gets the submittal on creation. Each next reviewer is notified when the previous one approves. Leave empty to send to {submittalManagerLabel} for routing.</small>
          </div>
        {:else}
          <div class="routing-handoff-note">
            <ArrowRight size={14} />
            <div>
              <strong>Goes to {submittalManagerLabel} for routing</strong>
              <span>They'll assign reviewers and kick off the workflow.</span>
            </div>
          </div>
        {/if}

        <label class="field-label">
          <span>Notes</span>
          <textarea class="field min-h-20" name="notes" placeholder="Routing notes, decision context"></textarea>
        </label>

        {#if canAttachFiles}
          <div class="field-label files-block">
            <span>Files</span>
            <AttachmentFields
              projectSlug={data.project?.id ?? ''}
              folderName={newSubmittalNumber.trim() ? `Submittal ${newSubmittalNumber.trim()} Attachments` : 'Submittal Attachments'}
              idPrefix="new-submittal"
              uploadLabel="Upload from this device"
              hideExisting
            />
          </div>
        {/if}

        <label class="notify-check">
          <input id="sub-create-emails" name="sendEmails" type="checkbox" checked />
          <Bell size={15} />
          <span>Send workflow emails when this submittal is created</span>
        </label>

        <footer class="modal-footer">
          <button class="btn btn-secondary" type="button" onclick={closeCreateModal}>Cancel</button>
          <button class="btn btn-primary" type="submit"><Check size={16} />Create submittal</button>
        </footer>
      </form>
    </div>
  </div>
{/if}

<!-- ────────── Detail modal ────────── -->
{#if selectedSubmittal}
  <div class="modal-backdrop" role="presentation" onclick={closeSubmittalModal}>
    <div class="detail-modal" class:has-preview={!!previewAttachment} role="dialog" aria-modal="true" aria-labelledby="submittal-modal-title" tabindex="-1" onclick={stopModalClick} onkeydown={handleModalKeydown}>
      <header class="modal-header">
        <div class="modal-title-block">
          <span class="eyebrow">Submittal {selectedSubmittal.number}</span>
          <h2 id="submittal-modal-title">{selectedSubmittal.title}</h2>
          <div class="modal-title-meta">
            <StatusPill label={selectedSubmittal.status} />
            <span class="meta-chip"><Paperclip size={13} />{selectedAttachments.length} file{selectedAttachments.length === 1 ? '' : 's'}</span>
            {#if selectedSubmittal.owner}
              <span class="meta-chip is-bic">Ball in court: <strong>{selectedSubmittal.owner}</strong></span>
            {/if}
            {#if selectedSubmittal.dueDate}
              <span class="meta-chip">Due {formatDate(selectedSubmittal.dueDate)}</span>
            {/if}
          </div>
        </div>
        <button class="icon-row-button" type="button" aria-label="Close" onclick={closeSubmittalModal}>
          <X size={17} />
        </button>
      </header>

      <div class="detail-body">
        <!-- ── Preview pane (only when a chip is active) ── -->
        {#if previewAttachment}
          <section class="files-pane" aria-label="File preview">
            <div class="preview-toolbar">
              <span class="preview-name" title={previewAttachment.path ?? previewAttachment.name}>
                {#if previewType(previewAttachment) === 'pdf'}<FileText size={14} />{:else if previewType(previewAttachment) === 'image'}<ImageIcon size={14} />{:else}<Paperclip size={14} />{/if}
                <span>{previewAttachment.name}</span>
                <small>{previewAttachment.size}</small>
              </span>
              <div class="preview-actions">
                {#if previewAttachment.id}
                  <a class="mini-button" href={`${previewSrc(previewAttachment)}?download=1`} title="Download">
                    <Download size={13} />
                  </a>
                {/if}
                <button class="mini-button" type="button" aria-label="Close preview" onclick={() => (activeAttachmentId = '')}>
                  <X size={13} />
                </button>
              </div>
            </div>
            <div class="preview-frame">
              {#if !previewAttachment.id}
                <div class="preview-empty">
                  <strong>{previewAttachment.name}</strong>
                  <span>This file does not have a stored copy yet.</span>
                </div>
              {:else if previewType(previewAttachment) === 'pdf'}
                {#key previewAttachment.id}
                  <EmbedPdfViewer
                    src={previewSrc(previewAttachment)}
                    title={previewAttachment.name}
                    originalDownloadUrl={`${previewSrc(previewAttachment)}?download=1`}
                  />
                {/key}
              {:else if previewType(previewAttachment) === 'image'}
                <div class="preview-image">
                  <img src={previewSrc(previewAttachment)} alt={previewAttachment.name} />
                </div>
              {:else}
                <div class="preview-empty">
                  <strong>{previewAttachment.name}</strong>
                  <span>Preview is not available for this file type.</span>
                  <a class="btn btn-secondary" href={`${previewSrc(previewAttachment)}?download=1`}>
                    <Download size={14} />Download to view
                  </a>
                </div>
              {/if}
            </div>
          </section>
        {/if}

        <!-- ── Control pane: files → meta → timeline → action drawer ── -->
        <section class="control-pane" aria-label="Submittal workflow">
          {#if selectedAttachments.length}
            <div class="file-rail" aria-label="Attached files">
              {#each selectedAttachments as attachment}
                <button
                  type="button"
                  class={fileChipClasses(attachment)}
                  title={attachment.path ?? attachment.name}
                  onclick={() => toggleAttachmentPreview(attachment)}
                >
                  {#if previewType(attachment) === 'pdf'}<FileText size={14} />{:else if previewType(attachment) === 'image'}<ImageIcon size={14} />{:else}<Paperclip size={14} />{/if}
                  <span>{attachment.name}</span>
                  <small>{attachment.size}</small>
                </button>
              {/each}
              {#if selectedSubmittal.id && selectedAttachments.filter((attachment) => attachment.id).length > 1}
                <a
                  class="file-chip file-download-all"
                  href={`/api/projects/${encodeURIComponent(data.project?.id ?? '')}/attachments/submittal/${encodeURIComponent(selectedSubmittal.id)}/download`}
                >
                  <Download size={14} />
                  <span>Download all</span>
                </a>
              {/if}
            </div>
          {/if}

          {#if !canActOnSelected && selectedSubmittal.id}
            <div class="readonly-banner">
              <Eye size={14} />
              <span>You're viewing this submittal. Only the assigned reviewer, the original submitter, or a project admin can change it.</span>
            </div>
          {:else if canEditSelected && !canWorkflowSelected}
            <div class="readonly-banner">
              <Eye size={14} />
              <span>You can edit your submittal details and add files. Only the assigned reviewer or a project admin can move the workflow.</span>
            </div>
          {/if}

          {#if editing && selectedSubmittal.id && canEditSelected}
            <form
              class="edit-form"
              method="post"
              action="?/updateSubmittal"
              enctype="multipart/form-data"
              use:enhance={resetOnSuccess(() => (editing = false))}
            >
              <input type="hidden" name="id" value={selectedSubmittal.id} />
              <input type="hidden" name="status" value={statusValue(selectedSubmittal.status)} />

              <label class="field-label">
                <span>Title</span>
                <input class="field" name="editTitle" value={selectedSubmittal.title} required />
              </label>
              <div class="field-row two">
                <label class="field-label">
                  <span>Spec section</span>
                  <input class="field" name="editSpecSection" value={selectedSubmittal.specSection ?? ''} />
                </label>
                <label class="field-label rev">
                  <span>Revision</span>
                  <input class="field" name="editRevision" type="number" min="0" value={selectedSubmittal.revision ?? 0} />
                </label>
              </div>
              <div class="field-row two">
                <label class="field-label">
                  <span>Submit by</span>
                  <input class="field" name="editSubmitBy" type="date" value={selectedSubmittal.submitBy ?? ''} />
                </label>
                <label class="field-label">
                  <span>Final due</span>
                  <input class="field" name="editDueDate" type="date" value={selectedSubmittal.dueDate ?? ''} />
                </label>
              </div>
              <label class="field-label">
                <span>Received from</span>
                <select class="field" name="editReceivedFrom">
                  <option value="" selected={!selectedSubmittal.receivedFromId}>Not received</option>
                  {#each data.directory.filter((person) => person.contactType !== 'external') as person}
                    <option value={person.id} selected={person.id === selectedSubmittal.receivedFromId}>{person.name} - {person.organization}</option>
                  {/each}
                </select>
              </label>
              <label class="field-label">
                <span>Notes</span>
                <textarea class="field min-h-20" name="editNotes">{selectedSubmittal.notes ?? ''}</textarea>
              </label>

              {#if canAttachFiles}
                <details class="files-actions">
                  <summary>
                    <Paperclip size={13} />{canRemoveAttachments ? 'Add or remove files' : 'Add files'}
                    <small>{selectedAttachments.length} attached</small>
                  </summary>
                  {#if canRemoveAttachments && selectedAttachments.some((attachment) => attachment.id)}
                    <fieldset class="remove-attachments">
                      <legend>Remove existing files (admin only)</legend>
                      {#each selectedAttachments.filter((attachment) => attachment.id) as attachment}
                        <label>
                          <input name="removeAttachmentIds" type="checkbox" value={attachment.id} />
                          <Trash2 size={12} />
                          <span>{attachment.name}</span>
                        </label>
                      {/each}
                    </fieldset>
                  {/if}
                  <AttachmentFields
                    projectSlug={data.project?.id ?? ''}
                    folderName={`Submittal ${selectedSubmittal.number} Attachments`}
                    idPrefix={`submittal-${selectedSubmittal.id}-edit-attachments`}
                    uploadLabel="Upload submittal files"
                    hideExisting
                  />
                </details>
              {/if}

              <footer class="form-footer">
                <button class="btn btn-secondary" type="button" onclick={() => (editing = false)}>Cancel</button>
                <button class="btn btn-primary" type="submit"><Check size={16} />Save details</button>
              </footer>
            </form>
          {:else}
            <div class="meta-grid">
              <div><span>Spec section</span><strong>{selectedSubmittal.specSection || '-'}</strong></div>
              <div><span>Revision</span><strong>{selectedSubmittal.revision ?? 0}</strong></div>
              <div><span>Submit by</span><strong>{formatDate(selectedSubmittal.submitBy)}</strong></div>
              <div><span>Final due</span><strong>{formatDate(selectedSubmittal.dueDate)}</strong></div>
              <div><span>Ball in court</span><strong>{selectedSubmittal.owner || 'Unassigned'}</strong></div>
              <div><span>Received from</span><strong>{selectedSubmittal.receivedFrom || '-'}</strong></div>
              <div class="meta-wide"><span>Submitted by</span><strong>{selectedSubmittal.submittedBy || '-'}</strong></div>
              {#if selectedSubmittal.notes}
                <div class="meta-wide"><span>Notes</span><strong>{selectedSubmittal.notes}</strong></div>
              {/if}
              {#if canEditSelected}
                <button type="button" class="meta-edit" onclick={() => (editing = true)}>
                  <PencilLine size={13} />Edit details
                </button>
              {/if}
            </div>

            {#if selectedSubmittal.routingSteps?.length}
              <!-- Routing timeline — current step carries inline actions -->
              <div class="timeline-block">
                <div class="block-title">
                  <span class="eyebrow">Workflow timeline</span>
                  <span>{routedCount(selectedSubmittal)} step{routedCount(selectedSubmittal) === 1 ? '' : 's'}</span>
                </div>
                <ol class="timeline">
                  {#each selectedSubmittal.routingSteps as step}
                    <li class={`timeline-step ${stepState(step, selectedSubmittal)}`}>
                      <span class="step-marker">
                        {#if step.status === 'Approved'}<Check size={13} />{:else}{step.order + 1}{/if}
                      </span>
                      <div>
                        <strong>{step.assignee}</strong>
                        <span>{step.role} - {step.status}{step.dueDate ? ` - Due ${formatDate(step.dueDate)}` : ''}{step.completedAt ? ` - Signed off ${formatDate(step.completedAt)}` : ''}</span>
                        {#if step.response}<p>{step.response}</p>{/if}
                        {#if isCurrentStep(step) && canWorkflowSelected && selectedSubmittal.id && !decisionArmed}
                          <div class="step-actions" role="group" aria-label="Decide on this step">
                            <button type="button" class="step-btn approve" onclick={() => armDecision('approved')}><Check size={13} />Approve</button>
                            <button type="button" class="step-btn revise" onclick={() => armDecision('revise_resubmit')}><RotateCcw size={13} />Revise</button>
                            <button type="button" class="step-btn reject" onclick={() => armDecision('rejected')}><XCircle size={13} />Reject</button>
                            <button type="button" class="step-btn review" onclick={() => armDecision('in_review')}><PencilLine size={13} />In review</button>
                          </div>
                        {/if}
                      </div>
                    </li>
                  {/each}
                </ol>

                {#if !decisionArmed && canWorkflowSelected && selectedSubmittal.id && isWorkflowClosed}
                  <div class="step-actions step-actions-loose" role="group" aria-label="Quick decision">
                    <button type="button" class="step-btn approve" onclick={() => armDecision('approved')}><Check size={13} />Approve</button>
                    <button type="button" class="step-btn revise" onclick={() => armDecision('revise_resubmit')}><RotateCcw size={13} />Revise</button>
                    <button type="button" class="step-btn reject" onclick={() => armDecision('rejected')}><XCircle size={13} />Reject</button>
                    <button type="button" class="step-btn review" onclick={() => armDecision('in_review')}><PencilLine size={13} />In review</button>
                  </div>
                {/if}
              </div>
            {:else if canRouteSubmittals && selectedSubmittal.id}
              <!-- No chain yet — manager sets it up here. -->
              <form
                class="routing-setup"
                method="post"
                action="?/routeSubmittal"
                use:enhance={resetOnSuccess()}
              >
                <input type="hidden" name="id" value={selectedSubmittal.id} />
                <div class="block-title">
                  <span class="eyebrow">Set up routing</span>
                  <span>Awaiting reviewers</span>
                </div>
                <p class="muted routing-setup-intro">Pick reviewers in order. Each gets an email when the previous one approves.</p>
                <div class="routing-rows">
                  {#each routingSetupRows as row, index (index)}
                    <div class="routing-row">
                      <span class="routing-step-marker" aria-hidden="true">{index + 1}</span>
                      <select
                        class="field"
                        name="routingAssigneeIds"
                        bind:value={row.assigneeId}
                        aria-label={`Reviewer ${index + 1}`}
                      >
                        <option value="">Pick reviewer</option>
                        {#each data.directory.filter((person) => person.contactType !== 'external') as person}
                          <option value={person.id}>{person.name} - {person.organization}</option>
                        {/each}
                      </select>
                      <input
                        class="field routing-due"
                        name="routingDueDates"
                        type="date"
                        bind:value={row.dueDate}
                        aria-label={`Due date for step ${index + 1}`}
                      />
                      <div class="routing-row-actions">
                        <button type="button" class="row-icon-btn" aria-label="Move up" title="Move up" disabled={index === 0} onclick={() => moveRoutingSetupRow(index, -1)}>
                          <ChevronUp size={13} />
                        </button>
                        <button type="button" class="row-icon-btn" aria-label="Move down" title="Move down" disabled={index === routingSetupRows.length - 1} onclick={() => moveRoutingSetupRow(index, 1)}>
                          <ChevronDown size={13} />
                        </button>
                        <button type="button" class="row-icon-btn is-danger" aria-label="Remove reviewer" title="Remove" onclick={() => removeRoutingSetupRow(index)} disabled={routingSetupRows.length === 1 && !row.assigneeId && !row.dueDate}>
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
                <button type="button" class="routing-add" onclick={addRoutingSetupRow}>
                  <Plus size={13} />Add reviewer
                </button>
                <label class="notify-check">
                  <input name="sendEmails" type="checkbox" checked />
                  <Bell size={15} />
                  <span>Email the first reviewer when the chain starts</span>
                </label>
                <footer class="form-footer">
                  <button class="btn btn-primary" type="submit"><ArrowRight size={16} />Send to workflow</button>
                </footer>
              </form>
            {:else}
              <div class="awaiting-routing">
                <ArrowRight size={14} />
                <div>
                  <strong>Awaiting routing</strong>
                  <span>{submittalManagerLabel} will assign reviewers shortly.</span>
                </div>
              </div>
            {/if}

            <!-- Action drawer — only when a decision is armed -->
            {#if decisionArmed && canWorkflowSelected && selectedSubmittal.id}
              <form
                class="action-drawer"
                method="post"
                action="?/updateSubmittal"
                enctype="multipart/form-data"
                use:enhance={resetOnSuccess(closeSubmittalModal)}
              >
                <input type="hidden" name="id" value={selectedSubmittal.id} />
                <input type="hidden" name="status" value={decisionStatus} />

                <div class="drawer-header">
                  <span class="drawer-tag is-{decisionStatus.replace('_','-')}">{decisionLabels[decisionStatus] ?? 'Update'}</span>
                  <button type="button" class="mini-button" onclick={cancelDecision} aria-label="Cancel decision">
                    <X size={13} />
                  </button>
                </div>

                {#if decisionStatus === 'approved'}
                  <p class="next-step-hint">
                    {#if nextRoutingStep}
                      <ArrowRight size={13} />Next reviewer: <strong>{nextRoutingStep.assignee}</strong>
                    {:else if isFinalRoutingStep}
                      <Check size={13} />Final approval — closes the submittal.
                    {:else}
                      <ArrowRight size={13} />Saves the approval. Use Next ball in court below to hand off.
                    {/if}
                  </p>
                {:else if decisionStatus === 'revise_resubmit' || decisionStatus === 'rejected'}
                  <p class="next-step-hint is-kickback">
                    <RotateCcw size={13} />Returns to <strong>{selectedSubmittal.submittedBy || 'the submitter'}</strong> for revision.
                  </p>
                {/if}

                <label class="field-label">
                  <span>Response</span>
                  <textarea class="field min-h-24" name="decision" bind:value={decisionResponse} placeholder="Record review notes, redlines, or routing context"></textarea>
                </label>

                <div class="field-row two">
                  <label class="field-label">
                    <span>Next ball in court</span>
                    <select class="field" name="workflowAssigneeId" aria-label="Next workflow assignee">
                      <option value="">Keep current ({selectedSubmittal.owner || 'Unassigned'})</option>
                      {#each data.directory.filter((person) => person.contactType !== 'external') as person}
                        <option value={person.id} selected={person.id === selectedSubmittal.ownerId}>{person.name}</option>
                      {/each}
                    </select>
                  </label>
                  <label class="field-label">
                    <span>Step due</span>
                    <input class="field" name="stepDueDate" type="date" value={selectedSubmittal.dueDate ?? ''} />
                  </label>
                </div>

                {#if canAttachFiles}
                  <details class="files-actions">
                    <summary>
                      <Paperclip size={13} />{canRemoveAttachments ? 'Add or remove files' : 'Add files'}
                      <small>{selectedAttachments.length} attached</small>
                    </summary>
                    {#if canRemoveAttachments && selectedAttachments.some((attachment) => attachment.id)}
                      <fieldset class="remove-attachments">
                        <legend>Remove existing files (admin only)</legend>
                        {#each selectedAttachments.filter((attachment) => attachment.id) as attachment}
                          <label>
                            <input name="removeAttachmentIds" type="checkbox" value={attachment.id} />
                            <Trash2 size={12} />
                            <span>{attachment.name}</span>
                          </label>
                        {/each}
                      </fieldset>
                    {/if}
                    <AttachmentFields
                      projectSlug={data.project?.id ?? ''}
                      folderName={`Submittal ${selectedSubmittal.number} Attachments`}
                      idPrefix={`submittal-${selectedSubmittal.id}-attachments`}
                      uploadLabel="Upload response files"
                      hideExisting
                    />
                  </details>
                {/if}

                <label class="notify-check">
                  <input id="sub-update-emails" name="sendEmails" type="checkbox" checked />
                  <Bell size={15} />
                  <span>Send workflow emails on save</span>
                </label>

                <footer class="form-footer">
                  <button class="btn btn-secondary" type="button" onclick={cancelDecision}>Cancel</button>
                  <button class="btn btn-primary" type="submit"><Check size={16} />Save decision</button>
                </footer>
              </form>
            {/if}
          {/if}
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Banners ── */
  .banner-error,
  .banner-ok {
    margin-bottom: 0.6rem;
    padding: 0.45rem 0.7rem;
    border-radius: 0.4rem;
    font-size: 0.82rem;
    font-weight: 800;
  }
  .banner-error { background: #fdecec; color: #9b1c1c; border: 1px solid #f4c0c0; }
  .banner-ok { background: rgba(29, 175, 63, 0.1); color: #197a31; border: 1px solid rgba(29, 175, 63, 0.22); }

  /* ── Workbench / table ── */
  .workflow-workbench { grid-template-columns: minmax(0, 1fr); }
  .workflow-table { min-width: 0; table-layout: fixed; }
  .workflow-table th:nth-child(1), .workflow-table td:nth-child(1) { width: 25%; }
  .workflow-table th:nth-child(2), .workflow-table td:nth-child(2) { width: 7%; }
  .workflow-table th:nth-child(3), .workflow-table td:nth-child(3) { width: 9%; }
  .workflow-table th:nth-child(4), .workflow-table td:nth-child(4) { width: 5%; }
  .workflow-table th:nth-child(7), .workflow-table td:nth-child(7) { width: 7%; }
  .workflow-table th:nth-child(5), .workflow-table td:nth-child(5),
  .workflow-table th:nth-child(6), .workflow-table td:nth-child(6) { width: 11%; }
  .workflow-table th:nth-child(8), .workflow-table td:nth-child(8),
  .workflow-table th:nth-child(9), .workflow-table td:nth-child(9) { width: 8%; }
  .workflow-table th:nth-child(10), .workflow-table td:nth-child(10) { width: 8%; min-width: 4rem; }

  .submittal-record-button {
    display: inline-flex; align-items: baseline; gap: 0.5rem;
    width: 100%; min-width: 0;
    border: 0; background: transparent; padding: 0;
    color: inherit; text-align: left;
    cursor: pointer;
  }
  .submittal-record-button .submittal-number {
    flex-shrink: 0;
    color: #1d5fb8; font-size: 0.78rem; font-weight: 850;
    text-decoration: underline;
  }
  .submittal-record-button .submittal-title {
    overflow: hidden; min-width: 0;
    color: #191b19; font-size: 0.82rem; font-weight: 800;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .submittal-record-button:hover .submittal-title { color: #164f9e; }

  .file-count-link, .file-count-static {
    display: inline-flex; align-items: center; gap: 0.28rem; max-width: 100%;
    border-radius: 0.35rem; color: #22532b; font-size: 0.74rem; font-weight: 850;
    line-height: 1; white-space: nowrap;
  }
  .file-count-link { border: 1px solid rgba(55, 95, 56, 0.18); background: rgba(55, 95, 56, 0.08); padding: 0.32rem 0.42rem; text-decoration: none; }
  .file-count-link:hover { border-color: rgba(55, 95, 56, 0.34); background: rgba(55, 95, 56, 0.14); }
  .file-count-link span, .file-count-static span { overflow: hidden; text-overflow: ellipsis; }
  .file-empty { color: #727a72; font-size: 0.74rem; font-weight: 750; }
  .row-actions {
    display: inline-flex; align-items: center; gap: 0.3rem;
  }
  .row-actions form { display: inline-flex; margin: 0; padding: 0; }
  .row-icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.7rem; height: 1.7rem;
    border: 1px solid rgba(25, 27, 25, 0.14); border-radius: 0.34rem;
    background: #fff; padding: 0;
    color: #2c322d;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, color 0.12s;
  }
  .row-icon-btn:hover { border-color: rgba(20, 146, 52, 0.45); background: rgba(29, 175, 63, 0.08); color: #197a31; }
  .row-icon-btn.is-danger:hover {
    border-color: rgba(176, 30, 30, 0.5); background: rgba(220, 38, 38, 0.1); color: #9b1c1c;
  }
  .filter-button:disabled { cursor: not-allowed; opacity: 0.45; }

  /* ── Modal shell ── */
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 60;
    display: grid; place-items: center;
    background: rgba(15, 17, 15, 0.42);
    padding: 1.25rem;
    backdrop-filter: blur(10px);
  }

  .create-modal {
    display: grid; grid-template-rows: auto 1fr;
    width: min(620px, 100%);
    max-height: min(86vh, 720px);
    overflow: hidden;
    border: 1px solid rgba(25, 27, 25, 0.16); border-radius: 0.5rem;
    background: #fff; box-shadow: 0 28px 90px -42px rgba(0, 0, 0, 0.65);
  }

  .detail-modal {
    display: grid; grid-template-rows: auto 1fr;
    width: min(620px, 100%);
    max-height: min(88vh, 880px);
    overflow: hidden;
    border: 1px solid rgba(25, 27, 25, 0.16); border-radius: 0.5rem;
    background: #fff; box-shadow: 0 28px 90px -42px rgba(0, 0, 0, 0.65);
    transition: width 0.18s ease;
  }
  .detail-modal.has-preview {
    width: min(1180px, 100%);
    max-height: min(94vh, 1080px);
  }

  .modal-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 1rem; padding: 0.85rem 1rem;
    border-bottom: 1px solid rgba(25, 27, 25, 0.1);
  }
  .modal-title-block { min-width: 0; }
  .modal-header h2 { margin: 0.16rem 0 0; color: #191b19; font-size: 1.05rem; font-weight: 850; line-height: 1.25; }
  .modal-title-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.45rem; align-items: center; }

  .meta-chip {
    display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.22rem 0.5rem;
    border: 1px solid rgba(25, 27, 25, 0.1);
    background: #fff;
    border-radius: 999px;
    color: #303830; font-size: 0.72rem; font-weight: 800;
  }
  .meta-chip.is-bic { border-color: rgba(29, 95, 184, 0.25); background: rgba(29, 95, 184, 0.08); color: #1d4f95; }
  .meta-chip strong { font-weight: 900; }

  /* ── Create form ── */
  .modal-body {
    overflow: auto;
    padding: 0.85rem 1rem;
  }
  .create-form { display: grid; gap: 0.55rem; }
  .field-row.two { display: grid; gap: 0.55rem; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: end; }
  .field-row.two .rev { grid-template-columns: minmax(4.5rem, 6.5rem); }

  .field-label { display: grid; gap: 0.22rem; min-width: 0; }
  .field-label > span { color: #4f594f; font-size: 0.7rem; font-weight: 850; text-transform: uppercase; }
  .field-label > span > i { font-style: normal; color: #b32020; margin-left: 2px; }
  .files-block > span { margin-bottom: 0.2rem; }
  .multi-select { min-height: 4.4rem; padding-block: 0.35rem; }
  .hint { color: #697169; font-size: 0.7rem; font-weight: 750; }

  /* Routing row builder (create modal) */
  .routing-block { gap: 0.4rem; }
  .routing-rows { display: grid; gap: 0.4rem; }
  .routing-row {
    display: grid;
    grid-template-columns: 1.6rem minmax(0, 1fr) minmax(7rem, 8.5rem) auto;
    align-items: center; gap: 0.4rem;
  }
  .routing-step-marker {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.55rem; height: 1.55rem;
    border: 1px solid rgba(25, 27, 25, 0.14); border-radius: 999px;
    background: #f5f6f4; color: #4f594f;
    font-size: 0.74rem; font-weight: 900;
  }
  .routing-due { padding-block: 0.35rem; }
  .routing-row-actions { display: inline-flex; gap: 0.2rem; }
  .routing-row-actions .row-icon-btn { width: 1.5rem; height: 1.5rem; }
  .routing-row-actions .row-icon-btn:disabled { opacity: 0.35; cursor: not-allowed; background: #fff; color: #2c322d; border-color: rgba(25, 27, 25, 0.14); }
  .routing-add {
    display: inline-flex; align-items: center; gap: 0.3rem;
    align-self: start;
    padding: 0.32rem 0.55rem;
    border: 1px dashed rgba(25, 27, 25, 0.22); border-radius: 0.36rem;
    background: #fff;
    color: #303830; font-size: 0.74rem; font-weight: 850;
    cursor: pointer;
  }
  .routing-add:hover { border-color: rgba(20, 146, 52, 0.5); background: rgba(29, 175, 63, 0.08); color: #197a31; }

  .routing-handoff-note {
    display: flex; align-items: center; gap: 0.55rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid rgba(29, 95, 184, 0.25); border-radius: 0.4rem;
    background: rgba(29, 95, 184, 0.06);
    color: #1d4f95;
  }
  .routing-handoff-note > div { display: grid; gap: 0.1rem; }
  .routing-handoff-note strong { color: #1d4f95; font-size: 0.8rem; font-weight: 850; }
  .routing-handoff-note span { color: #4f594f; font-size: 0.74rem; font-weight: 750; }

  .routing-setup {
    display: grid; gap: 0.55rem;
    border: 1px solid rgba(29, 95, 184, 0.22); border-radius: 0.45rem;
    background: rgba(29, 95, 184, 0.05);
    padding: 0.7rem 0.75rem;
  }
  .routing-setup-intro { font-size: 0.74rem; }

  .awaiting-routing {
    display: flex; align-items: center; gap: 0.55rem;
    padding: 0.6rem 0.7rem;
    border: 1px solid rgba(202, 138, 4, 0.28); border-radius: 0.4rem;
    background: rgba(202, 138, 4, 0.08);
    color: #855508;
  }
  .awaiting-routing > div { display: grid; gap: 0.1rem; }
  .awaiting-routing strong { color: #855508; font-size: 0.8rem; font-weight: 850; }
  .awaiting-routing span { color: #5b3e0a; font-size: 0.74rem; font-weight: 750; }
  .min-h-20 { min-height: 3.6rem; }
  .min-h-24 { min-height: 4.6rem; }

  .notify-check {
    display: inline-flex; align-items: center; gap: 0.45rem;
    color: #303630; font-size: 0.82rem; font-weight: 850;
    margin-top: 0.2rem;
  }
  .notify-check input { width: 1rem; height: 1rem; accent-color: #191b19; }

  .modal-footer {
    display: flex; justify-content: flex-end; gap: 0.55rem;
    border-top: 1px solid rgba(25, 27, 25, 0.08);
    padding-top: 0.8rem; margin-top: 0.4rem;
  }

  /* ── Detail body grid ── */
  .detail-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  .detail-modal.has-preview .detail-body {
    grid-template-columns: minmax(0, 1.45fr) minmax(380px, 0.85fr);
  }

  /* Left pane: preview only (rendered when an attachment is active) */
  .files-pane {
    display: grid; grid-template-rows: auto 1fr;
    min-width: 0; min-height: 0;
    background: #f5f6f4;
    border-right: 1px solid rgba(25, 27, 25, 0.08);
  }

  .preview-toolbar {
    display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    padding: 0.5rem 0.7rem;
    background: #fff;
    border-bottom: 1px solid rgba(25, 27, 25, 0.08);
  }
  .preview-name {
    display: inline-flex; align-items: center; gap: 0.35rem; min-width: 0;
    color: #1c211d; font-size: 0.78rem; font-weight: 850;
  }
  .preview-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview-name small { color: #697169; font-size: 0.68rem; font-weight: 800; }
  .preview-actions { display: inline-flex; gap: 0.3rem; }

  /* File rail lives in the control pane now */
  .file-rail {
    display: flex; gap: 0.4rem;
    overflow-x: auto;
    padding-bottom: 0.1rem;
  }

  .file-chip {
    display: inline-flex; align-items: center; gap: 0.32rem; flex-shrink: 0;
    border: 1px solid rgba(25, 27, 25, 0.12); border-radius: 0.4rem;
    background: #fff; padding: 0.32rem 0.5rem;
    color: #2c322d; font-size: 0.74rem; font-weight: 800;
    cursor: pointer;
  }
  .file-chip span { max-width: 12rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-chip small { color: #697169; font-size: 0.66rem; font-weight: 800; }
  .file-chip:hover { border-color: rgba(20, 146, 52, 0.45); }
  .file-chip.is-active {
    border-color: rgba(20, 146, 52, 0.6);
    background: rgba(29, 175, 63, 0.1);
    color: #197a31;
  }
  .file-download-all {
    border-color: rgba(29, 95, 184, 0.2);
    background: rgba(29, 95, 184, 0.07);
    color: #1d4f95;
    text-decoration: none;
  }
  .file-download-all:hover {
    border-color: rgba(29, 95, 184, 0.4);
    background: rgba(29, 95, 184, 0.12);
  }

  .preview-frame {
    min-width: 0; min-height: 0;
    display: flex;
    background: #2b2d2b;
  }

  .preview-frame :global(.embedpdf-shell) {
    width: 100%;
    height: 100%;
  }

  .preview-image {
    width: 100%; height: 100%;
    display: grid; place-items: center;
    background: #1f211f;
    overflow: auto;
  }
  .preview-image img { max-width: 100%; max-height: 100%; object-fit: contain; }

  .preview-empty {
    margin: auto; padding: 1.5rem;
    display: grid; gap: 0.5rem; justify-items: center;
    color: #f1f3ef; text-align: center;
    background: transparent;
  }
  .preview-empty strong { color: #fff; font-size: 0.95rem; font-weight: 850; }
  .preview-empty span { color: #d3d6d2; font-size: 0.8rem; font-weight: 700; }
  .preview-empty .btn { color: #fff; background: rgba(255, 255, 255, 0.14); border-color: rgba(255, 255, 255, 0.22); }
  .preview-empty .btn:hover { background: rgba(255, 255, 255, 0.22); }

  /* Control pane: file rail → meta → timeline → action drawer */
  .control-pane {
    display: grid; gap: 0.7rem; align-content: start;
    overflow: auto;
    padding: 0.85rem;
    min-height: 0;
  }

  /* Inline timeline-step actions (current step only) */
  .step-actions {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.32rem;
    margin-top: 0.4rem;
  }
  .step-actions-loose { margin-top: 0.55rem; }
  .step-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.3rem;
    min-height: 1.95rem;
    border: 1px solid rgba(25, 27, 25, 0.14); border-radius: 0.36rem;
    background: #fff; padding: 0.32rem 0.5rem;
    color: #1c211d; font-size: 0.74rem; font-weight: 850;
    cursor: pointer;
  }
  .step-btn.approve:hover { border-color: rgba(20, 146, 52, 0.5); background: rgba(29, 175, 63, 0.1); color: #197a31; }
  .step-btn.revise:hover { border-color: rgba(180, 110, 16, 0.45); background: rgba(202, 138, 4, 0.12); color: #855508; }
  .step-btn.reject:hover { border-color: rgba(176, 30, 30, 0.45); background: rgba(220, 38, 38, 0.1); color: #9b1c1c; }
  .step-btn.review:hover { border-color: rgba(29, 95, 184, 0.45); background: rgba(29, 95, 184, 0.1); color: #1d4f95; }

  .meta-grid {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0;
    overflow: hidden;
    border: 1px solid rgba(25, 27, 25, 0.1); border-radius: 0.4rem;
    background: #fff;
    position: relative;
  }
  .meta-grid > div {
    display: grid; gap: 0.18rem;
    padding: 0.5rem 0.6rem;
    border-right: 1px solid rgba(25, 27, 25, 0.08);
    border-bottom: 1px solid rgba(25, 27, 25, 0.08);
    min-height: 3rem;
  }
  .meta-grid > div:nth-child(2n) { border-right: 0; }
  .meta-grid > div span { color: #5c665d; font-size: 0.66rem; font-weight: 850; text-transform: uppercase; }
  .meta-grid > div strong {
    color: #202520; font-size: 0.8rem; font-weight: 800;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .meta-wide { grid-column: 1 / -1; border-right: 0; }
  .meta-wide strong { white-space: pre-wrap; }
  .meta-edit {
    grid-column: 1 / -1;
    display: inline-flex; align-items: center; justify-content: center; gap: 0.32rem;
    border: 0; border-top: 1px solid rgba(25, 27, 25, 0.08);
    background: rgba(255, 255, 255, 0.6); padding: 0.45rem 0.6rem;
    color: #1d5fb8; font-size: 0.74rem; font-weight: 850;
    cursor: pointer;
  }
  .meta-edit:hover { background: rgba(29, 95, 184, 0.06); }

  .timeline-block { display: grid; gap: 0.5rem; }
  .block-title { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; }
  .block-title .eyebrow { color: #4f594f; font-size: 0.68rem; font-weight: 850; text-transform: uppercase; }
  .block-title span:last-child { color: #5c665d; font-size: 0.7rem; font-weight: 800; }

  .timeline { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
  .timeline-step {
    display: grid; grid-template-columns: 1.6rem minmax(0, 1fr); gap: 0.55rem;
    padding: 0.42rem 0;
    border-bottom: 1px solid rgba(25, 27, 25, 0.06);
  }
  .timeline-step:first-child { padding-top: 0; }
  .timeline-step:last-child { border-bottom: 0; padding-bottom: 0; }
  .step-marker {
    display: inline-flex; align-items: center; justify-content: center;
    width: 1.45rem; height: 1.45rem;
    border: 1px solid rgba(25, 27, 25, 0.14); border-radius: 999px;
    background: #fff; color: #4f594f; font-size: 0.72rem; font-weight: 850;
  }
  .timeline-step.current .step-marker { border-color: #18a53a; color: #fff; background: #18a53a; }
  .timeline-step.complete .step-marker { border-color: rgba(24, 165, 58, 0.2); color: #147a31; background: rgba(29, 175, 63, 0.13); }
  .timeline-step.attention .step-marker { border-color: rgba(220, 38, 38, 0.18); color: #a83333; background: rgba(220, 38, 38, 0.1); }

  .timeline-step strong, .timeline-step span, .timeline-step p {
    display: block; margin: 0; font-size: 0.74rem; line-height: 1.35;
  }
  .timeline-step strong {
    overflow: hidden; color: #191b19; font-weight: 850;
    text-overflow: ellipsis; white-space: nowrap;
  }
  .timeline-step span { color: #4f594f; }
  .timeline-step p { color: #303830; margin-top: 0.15rem; white-space: pre-wrap; }
  .muted { margin: 0; color: #697169; font-size: 0.78rem; font-weight: 750; }

  .readonly-banner {
    display: inline-flex; align-items: center; gap: 0.45rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid rgba(29, 95, 184, 0.2);
    border-radius: 0.4rem;
    background: rgba(29, 95, 184, 0.06);
    color: #1d4f95;
    font-size: 0.78rem; font-weight: 800; line-height: 1.4;
  }
  .readonly-banner span { overflow-wrap: anywhere; }

  /* ── Update / edit forms ── */
  .edit-form {
    display: grid; gap: 0.55rem;
    border-top: 1px solid rgba(25, 27, 25, 0.08);
    padding-top: 0.7rem;
  }

  .action-drawer {
    display: grid; gap: 0.55rem;
    border: 1px solid rgba(25, 27, 25, 0.12); border-radius: 0.45rem;
    background: #fafbf9;
    padding: 0.7rem 0.75rem;
  }
  .drawer-header {
    display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    margin-bottom: 0.1rem;
  }
  .drawer-tag {
    display: inline-flex; align-items: center; gap: 0.3rem;
    padding: 0.22rem 0.55rem;
    border-radius: 999px;
    font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.02em;
    border: 1px solid rgba(25, 27, 25, 0.14);
    background: #fff; color: #303830;
  }
  .drawer-tag.is-approved { border-color: rgba(20, 146, 52, 0.4); background: rgba(29, 175, 63, 0.12); color: #197a31; }
  .drawer-tag.is-revise-resubmit { border-color: rgba(180, 110, 16, 0.45); background: rgba(202, 138, 4, 0.14); color: #855508; }
  .drawer-tag.is-rejected { border-color: rgba(176, 30, 30, 0.45); background: rgba(220, 38, 38, 0.12); color: #9b1c1c; }
  .drawer-tag.is-in-review { border-color: rgba(29, 95, 184, 0.4); background: rgba(29, 95, 184, 0.1); color: #1d4f95; }

  .next-step-hint {
    display: inline-flex; align-items: center; gap: 0.32rem;
    margin: 0;
    color: #303830; font-size: 0.78rem; font-weight: 800;
  }
  .next-step-hint strong { color: #191b19; font-weight: 900; }
  .next-step-hint.is-kickback { color: #855508; }

  .form-footer {
    display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.2rem;
  }

  .files-actions {
    border: 1px solid rgba(25, 27, 25, 0.1); border-radius: 0.4rem;
    background: #fff;
  }
  .files-actions summary {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.45rem 0.6rem;
    color: #303830; font-size: 0.78rem; font-weight: 850;
    cursor: pointer;
    list-style: none;
    width: 100%;
  }
  .files-actions summary::-webkit-details-marker { display: none; }
  .files-actions summary::before {
    content: '+'; display: inline-block; width: 0.95rem; text-align: center;
    color: #4f594f; font-size: 0.85rem; font-weight: 900;
  }
  .files-actions[open] summary::before { content: '-'; }
  .files-actions summary small { margin-left: auto; color: #697169; font-size: 0.7rem; font-weight: 800; }
  .files-actions[open] summary { border-bottom: 1px solid rgba(25, 27, 25, 0.08); }
  .files-actions :global(.attachment-fields) {
    margin: 0.55rem 0.6rem 0.7rem;
    grid-template-columns: 1fr;
  }

  .remove-attachments {
    display: flex; flex-wrap: wrap; gap: 0.4rem;
    margin: 0.55rem 0.6rem 0;
    border: 0; padding: 0;
  }
  .remove-attachments legend {
    width: 100%;
    color: #4f594f; font-size: 0.66rem; font-weight: 850; text-transform: uppercase;
    margin-bottom: 0.3rem;
  }
  .remove-attachments label {
    display: inline-flex; align-items: center; gap: 0.32rem;
    border: 1px solid rgba(25, 27, 25, 0.12); border-radius: 0.32rem;
    background: #fff; padding: 0.32rem 0.5rem;
    color: #303830; font-size: 0.74rem; font-weight: 800;
    cursor: pointer;
  }
  .remove-attachments label:has(input:checked) {
    border-color: rgba(176, 30, 30, 0.45);
    background: rgba(220, 38, 38, 0.08);
    color: #9b1c1c;
  }

  /* ── Mobile fallbacks ── */
  @media (max-width: 960px) {
    .workflow-table { min-width: 920px; }
    .detail-modal,
    .detail-modal.has-preview { width: 100%; height: 100%; max-height: 100vh; border-radius: 0; }
    .detail-modal.has-preview .detail-body {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(45vh, 1fr) auto;
    }
    .files-pane { border-right: 0; border-bottom: 1px solid rgba(25, 27, 25, 0.08); }
    .control-pane { padding: 0.75rem; }
  }

  @media (max-width: 640px) {
    .modal-backdrop { padding: 0; align-items: end; }
    .create-modal { width: 100%; max-height: 92vh; border-radius: 0.45rem 0.45rem 0 0; }
    .detail-modal { border-radius: 0; }
    .field-row.two { grid-template-columns: 1fr; }
    .step-actions { grid-template-columns: 1fr 1fr; }
    .meta-grid { grid-template-columns: 1fr; }
    .meta-grid > div { border-right: 0; }
  }
</style>
