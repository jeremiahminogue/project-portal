export type NotificationEventType =
  | 'rfi.created'
  | 'rfi.ball_in_court_shift'
  | 'rfi.assigned'
  | 'rfi.response_added'
  | 'rfi.closed'
  | 'rfi.reopened'
  | 'rfi.due_date_changed'
  | 'submittal.created'
  | 'submittal.action_required'
  | 'submittal.workflow_step_completed'
  | 'submittal.updated'
  | 'submittal.approved'
  | 'submittal.revise_resubmit'
  | 'submittal.rejected'
  | 'photo.uploaded'
  | 'photo.shared'
  | 'photo.comment_mentioned';

export type NotificationEntityType = 'rfi' | 'submittal' | 'file' | 'photo';

export type RecipientKind =
  | 'creator'
  | 'assignee'
  | 'rfi_manager'
  | 'project_admins'
  | 'distribution'
  | 'owner'
  | 'workflow_assignee'
  | 'photo_subscribers'
  | 'shared_users'
  | 'mentioned_users';

export type DigestFrequency = 'immediate' | 'hourly' | 'daily';

export type NotificationRule = {
  eventType: NotificationEventType;
  recipientKind: RecipientKind;
  enabled: boolean;
  required: boolean;
  digestFrequency: DigestFrequency;
};

export type NotificationRecipient = {
  userId: string | null;
  email: string;
  name: string;
  role?: string | null;
  kind: RecipientKind;
  required: boolean;
  digestFrequency: DigestFrequency;
};

export type NotificationEventInput = {
  projectId: string;
  actorId?: string | null;
  type: NotificationEventType;
  entityType: NotificationEntityType;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
};

export type PersistedNotificationEvent = NotificationEventInput & {
  id: string;
  dedupeKey: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type NotificationEventDefinition = {
  type: NotificationEventType;
  label: string;
  group: 'RFIs' | 'Submittals' | 'Photos';
  description: string;
  userConfigurable: boolean;
};

export type RecipientKindDefinition = {
  kind: RecipientKind;
  label: string;
  description: string;
};

export const notificationEventDefinitions: NotificationEventDefinition[] = [
  {
    type: 'rfi.created',
    label: 'RFI created',
    group: 'RFIs',
    description: 'A new RFI is opened and routed to its RFI manager, assignee, and distribution list.',
    userConfigurable: true
  },
  {
    type: 'rfi.ball_in_court_shift',
    label: 'RFI ball in court shifted',
    group: 'RFIs',
    description: 'Mandatory assignment alert for the user who now owns the RFI action.',
    userConfigurable: false
  },
  {
    type: 'rfi.assigned',
    label: 'RFI reassigned',
    group: 'RFIs',
    description: 'An RFI is reassigned and routed to the RFI manager, assignee, and distribution list.',
    userConfigurable: true
  },
  {
    type: 'rfi.response_added',
    label: 'RFI response added',
    group: 'RFIs',
    description: 'A response or answer is added to an RFI.',
    userConfigurable: true
  },
  {
    type: 'rfi.closed',
    label: 'RFI closed',
    group: 'RFIs',
    description: 'An RFI is closed after answer review.',
    userConfigurable: true
  },
  {
    type: 'rfi.reopened',
    label: 'RFI reopened',
    group: 'RFIs',
    description: 'A closed RFI is reopened for more coordination.',
    userConfigurable: true
  },
  {
    type: 'rfi.due_date_changed',
    label: 'RFI due date changed',
    group: 'RFIs',
    description: 'The RFI due date changes.',
    userConfigurable: true
  },
  {
    type: 'submittal.created',
    label: 'Submittal created',
    group: 'Submittals',
    description: 'A new submittal is created and optionally sent to configured stakeholders.',
    userConfigurable: true
  },
  {
    type: 'submittal.action_required',
    label: 'Submittal action required',
    group: 'Submittals',
    description: 'Mandatory workflow email for the person responsible for the current submittal step.',
    userConfigurable: false
  },
  {
    type: 'submittal.workflow_step_completed',
    label: 'Submittal workflow step completed',
    group: 'Submittals',
    description: 'A workflow reviewer completes their required action.',
    userConfigurable: true
  },
  {
    type: 'submittal.updated',
    label: 'Submittal updated',
    group: 'Submittals',
    description: 'A submittal status, note, or routing value changes.',
    userConfigurable: true
  },
  {
    type: 'submittal.approved',
    label: 'Submittal approved',
    group: 'Submittals',
    description: 'A submittal receives an approved decision.',
    userConfigurable: true
  },
  {
    type: 'submittal.revise_resubmit',
    label: 'Submittal revise and resubmit',
    group: 'Submittals',
    description: 'A submittal receives a revise-and-resubmit decision.',
    userConfigurable: true
  },
  {
    type: 'submittal.rejected',
    label: 'Submittal rejected',
    group: 'Submittals',
    description: 'A submittal receives a rejected decision.',
    userConfigurable: true
  },
  {
    type: 'photo.uploaded',
    label: 'Photo uploaded',
    group: 'Photos',
    description: 'Uploaded project photos are queued into the daily photo digest.',
    userConfigurable: true
  },
  {
    type: 'photo.shared',
    label: 'Photo shared',
    group: 'Photos',
    description: 'Mandatory direct email when a photo is intentionally shared.',
    userConfigurable: false
  },
  {
    type: 'photo.comment_mentioned',
    label: 'Photo comment mention',
    group: 'Photos',
    description: 'Mandatory mention email when someone is tagged on a photo comment.',
    userConfigurable: false
  }
];

export const recipientKindDefinitions: RecipientKindDefinition[] = [
  {
    kind: 'creator',
    label: 'Creator',
    description: 'The user who originally created the item.'
  },
  {
    kind: 'assignee',
    label: 'Assignee',
    description: 'The RFI ball-in-court user.'
  },
  {
    kind: 'rfi_manager',
    label: 'RFI manager',
    description: 'The user responsible for managing the RFI.'
  },
  {
    kind: 'project_admins',
    label: 'Project admins',
    description: 'Project admins and portal superadmins assigned to the project.'
  },
  {
    kind: 'distribution',
    label: 'Distribution',
    description: 'All project members with an email address, excluding the actor when possible.'
  },
  {
    kind: 'owner',
    label: 'Responsible contractor',
    description: 'The submittal owner or responsible contractor.'
  },
  {
    kind: 'workflow_assignee',
    label: 'Workflow assignee',
    description: 'The person responsible for the current workflow step.'
  },
  {
    kind: 'photo_subscribers',
    label: 'Photo subscribers',
    description: 'Users subscribed to daily project photo upload emails.'
  },
  {
    kind: 'shared_users',
    label: 'Shared recipients',
    description: 'Users or email addresses explicitly chosen when sharing a photo.'
  },
  {
    kind: 'mentioned_users',
    label: 'Mentioned users',
    description: 'Users mentioned in a photo comment.'
  }
];

export const defaultNotificationRules: NotificationRule[] = [
  { eventType: 'rfi.created', recipientKind: 'rfi_manager', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.created', recipientKind: 'assignee', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.created', recipientKind: 'distribution', enabled: true, required: false, digestFrequency: 'immediate' },
  {
    eventType: 'rfi.ball_in_court_shift',
    recipientKind: 'assignee',
    enabled: true,
    required: true,
    digestFrequency: 'immediate'
  },
  { eventType: 'rfi.assigned', recipientKind: 'rfi_manager', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.assigned', recipientKind: 'assignee', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.assigned', recipientKind: 'distribution', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.response_added', recipientKind: 'rfi_manager', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.response_added', recipientKind: 'assignee', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.response_added', recipientKind: 'distribution', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.closed', recipientKind: 'creator', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.closed', recipientKind: 'rfi_manager', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.closed', recipientKind: 'assignee', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.closed', recipientKind: 'distribution', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.reopened', recipientKind: 'rfi_manager', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.reopened', recipientKind: 'assignee', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.reopened', recipientKind: 'distribution', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.due_date_changed', recipientKind: 'rfi_manager', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'rfi.due_date_changed', recipientKind: 'assignee', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.created', recipientKind: 'owner', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.created', recipientKind: 'project_admins', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.action_required', recipientKind: 'workflow_assignee', enabled: true, required: true, digestFrequency: 'immediate' },
  { eventType: 'submittal.workflow_step_completed', recipientKind: 'owner', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.workflow_step_completed', recipientKind: 'project_admins', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.updated', recipientKind: 'owner', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.updated', recipientKind: 'project_admins', enabled: false, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.approved', recipientKind: 'owner', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.approved', recipientKind: 'project_admins', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.revise_resubmit', recipientKind: 'owner', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.revise_resubmit', recipientKind: 'project_admins', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.rejected', recipientKind: 'owner', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'submittal.rejected', recipientKind: 'project_admins', enabled: true, required: false, digestFrequency: 'immediate' },
  { eventType: 'photo.uploaded', recipientKind: 'photo_subscribers', enabled: true, required: false, digestFrequency: 'daily' },
  { eventType: 'photo.shared', recipientKind: 'shared_users', enabled: true, required: true, digestFrequency: 'immediate' },
  { eventType: 'photo.comment_mentioned', recipientKind: 'mentioned_users', enabled: true, required: true, digestFrequency: 'immediate' }
];

export function notificationEventLabel(type: NotificationEventType) {
  return notificationEventDefinitions.find((definition) => definition.type === type)?.label ?? type;
}
