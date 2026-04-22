import { redirect } from "next/navigation";

/**
 * Admin root just redirects to the Users screen — that's the only section
 * for now. When we add more top-level admin surfaces (Projects, Audit log)
 * this becomes a small dashboard with KPI cards.
 */
export default function AdminIndex() {
  redirect("/admin/users");
}
