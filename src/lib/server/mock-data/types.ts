export type StatusChip = "green" | "amber" | "red" | "blue" | "gray" | "purple";

export interface Project {
  id: string;
  number: string;
  title: string;
  address: string;
  owner: string;
  status: "Pre-Con" | "Construction" | "Design" | "Closed";
  completionPercent: number;
  targetComplete: string;
  nextMilestone: string;
  nextMilestoneDate: string;
  openSubmittals: number;
  openRfis: number;
  actionItems: number;
  lastActivity: string;
  lastActivityTime: string;
  lastActivityAuthor: string;
}

export interface ScheduleActivity {
  id: string;
  phase: "Events Center" | "Palace of Ag" | "Maintenance" | "Creative Arts" | "Coors Pavilion";
  title: string;
  type: "design" | "bcer" | "ahj" | "field" | "milestone" | "internal";
  startDate: string;
  endDate: string;
  owner: string;
  status: StatusChip;
  isBlackout: boolean;
  isToday?: boolean;
  predecessorId?: string | null;
  predecessorRefs?: string | null;
  sourceOrder?: number | null;
  sourceWbs?: string | null;
  percentComplete?: number;
}

export interface SubmittalRoutingStep {
  id?: string;
  order: number;
  assigneeId?: string | null;
  assignee: string;
  role: string;
  status: "Draft" | "Submitted" | "In Review" | "Approved" | "Revise & Resubmit" | "Rejected";
  dueDate?: string | null;
  response?: string | null;
  required?: boolean;
  completedAt?: string | null;
}

export interface Submittal {
  id?: string;
  number: string;
  title: string;
  specSection: string;
  submittedDate: string;
  dueDate: string;
  owner: string;
  ownerId?: string | null;
  status: "Submitted" | "In Review" | "Approved" | "Revise & Resubmit" | "Rejected" | "Draft";
  routing: string[];
  routingSteps?: SubmittalRoutingStep[];
  revision?: number;
  submitBy?: string | null;
  receivedFrom?: string | null;
  receivedFromId?: string | null;
  decision?: string | null;
  notes?: string | null;
  attachments?: { id?: string; name: string; size: string; type: string; path?: string }[];
}

export interface RfiActivity {
  at: string;
  by: string;
  type: string;
  note: string;
}

export interface RFI {
  id?: string;
  number: string;
  title?: string;
  question: string;
  suggestedSolution?: string;
  reference?: string;
  openedDate: string;
  dueDate: string;
  assignedTo: string;
  assignedOrg: string;
  status: "Open" | "Answered" | "Closed";
  answer?: string | null;
  rfiManager?: string;
  rfiManagerId?: string | null;
  assignedToId?: string | null;
  createdById?: string | null;
  distribution?: string[];
  distributionIds?: string[];
  activity?: RfiActivity[];
  attachments?: { id?: string; name: string; size: string; type: string; path?: string }[];
}

export interface FileEntry {
  id: string;
  name: string;
  path: string;
  size: string;
  type: "pdf" | "docx" | "xlsx" | "image";
  updatedAt: string;
  uploadedBy: string;
  tags?: string[];
  sortOrder?: number | null;
}

export interface FolderEntry {
  id?: string;
  name: string;
  path?: string;
  parentFolderId?: string | null;
  depth?: number;
  fileCount: number;
  documentKind?: 'drawing' | 'specification' | 'file' | string | null;
}

export interface ChatMessage {
  id: string;
  author: string;
  role: string;
  body: string;
  timestamp: string;
  attachments?: { id?: string; name: string; size: string; type: string; path?: string }[];
  reactions?: { emoji: string; count: number }[];
  isPinned?: boolean;
}

export interface ChatSubject {
  id: string;
  name: string;
  description: string;
  messageCount: number;
  unreadCount?: number;
  messages: ChatMessage[];
  participants: string[];
}

export interface Update {
  id: string;
  type: "OAC Recap" | "Phase Kickoff" | "Safety" | "Weekly" | "General";
  title: string;
  body: string;
  author: string;
  postedDate: string;
  postedTime: string;
  likes: number;
  commentCount: number;
  likedByMe?: boolean;
  comments?: { id: string; author: string; body: string; createdAt: string }[];
  attachments?: { id?: string; name: string; size: string; type: string; path?: string }[];
}

export interface DirectoryEntry {
  id: string;
  name: string;
  role: string;
  organization: string;
  email?: string;
  phone?: string | null;
  contactType?: "portal" | "external";
  status: "Admin" | "Member" | "Guest-Admin" | "Guest" | "Reviewer" | "Owner" | "AHJ";
}

export interface Member {
  id: string;
  initials: string;
  name: string;
  role: string;
  organization: string;
}
