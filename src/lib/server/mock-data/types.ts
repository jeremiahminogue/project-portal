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
}

export interface Submittal {
  number: string;
  title: string;
  specSection: string;
  submittedDate: string;
  dueDate: string;
  owner: string;
  status: "Submitted" | "In Review" | "Approved" | "Revise & Resubmit" | "Rejected" | "Draft";
  routing: string[];
}

export interface RFI {
  number: string;
  question: string;
  openedDate: string;
  dueDate: string;
  assignedTo: string;
  assignedOrg: string;
  status: "Open" | "Answered" | "Closed";
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
}

export interface FolderEntry {
  name: string;
  fileCount: number;
}

export interface ChatMessage {
  id: string;
  author: string;
  role: string;
  body: string;
  timestamp: string;
  attachments?: { name: string; size: string; type: string }[];
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
  type: "OAC Recap" | "Phase Kickoff" | "Safety" | "Weekly";
  title: string;
  body: string;
  author: string;
  postedDate: string;
  postedTime: string;
  likes: number;
  commentCount: number;
  attachments?: { name: string; size: string; type: string }[];
}

export interface DirectoryEntry {
  id: string;
  name: string;
  role: string;
  organization: string;
  email?: string;
  status: "Admin" | "Member" | "Guest-Admin" | "Guest" | "Reviewer" | "Owner" | "AHJ";
}

export interface Member {
  id: string;
  initials: string;
  name: string;
  role: string;
  organization: string;
}
