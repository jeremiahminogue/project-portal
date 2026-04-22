/**
 * Query layer — server-only.
 *
 * Usage in pages:
 *   import { getProjects, getProject } from "@/lib/queries";
 *   const projects = await getProjects();
 *
 * All wrappers:
 *  - Are `async` (pages must `await`)
 *  - Return the exact types in `data/types.ts` (no view-layer churn)
 *  - Short-circuit to `data/*.ts` mock sources when NEXT_PUBLIC_SUPABASE_URL
 *    is unset (keeps dev frictionless)
 *  - Throw on real Supabase errors (never swallow silently)
 */
export { getProjects, getProject, getProjectId } from "./projects";
export { getSchedule } from "./schedule";
export { getSubmittals, getRfis } from "./submittals";
export { getFiles, getFolders } from "./files";
export { getChatSubjects } from "./chat";
export { getUpdates } from "./updates";
export { getDirectory } from "./directory";
export {
  listAllUsers,
  listAllProjects,
  getUserDetail,
  type AdminUserRow,
  type AdminProjectRow,
  type AdminMembershipRow,
  type AdminUserDetail,
} from "./admin";
