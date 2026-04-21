import "server-only";
import type { ScheduleActivity } from "@/data/types";
import { scheduleActivities as mockSchedule } from "@/data/schedule";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK } from "./_config";
import { getProjectId } from "./projects";

interface ScheduleRow {
  id: string;
  phase: string;
  title: string;
  start_date: string;
  end_date: string;
  owner: string | null;
  status: string;
  is_blackout: boolean | null;
}

/**
 * List schedule activities for a project.
 *
 * NOTE: The `type` field on ScheduleActivity (design/bcer/ahj/...) isn't on
 * the DB row yet. We default to "internal" for live rows until a follow-up
 * migration adds the column or we derive it from the phase.
 */
export async function getSchedule(
  slug: string,
): Promise<ScheduleActivity[]> {
  if (USE_MOCK) return mockSchedule;

  const supabase = createClient();
  const projectId = await getProjectId(slug);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("schedule_activities")
    .select(
      "id, phase, title, start_date, end_date, owner, status, is_blackout",
    )
    .eq("project_id", projectId)
    .order("start_date", { ascending: true });

  if (error) throw new Error(`getSchedule failed: ${error.message}`);

  return (data ?? []).map(
    (row: ScheduleRow): ScheduleActivity => ({
      id: row.id,
      phase: row.phase as ScheduleActivity["phase"],
      title: row.title,
      type: "internal",
      startDate: row.start_date,
      endDate: row.end_date,
      owner: row.owner ?? "",
      status: row.status as ScheduleActivity["status"],
      isBlackout: row.is_blackout ?? false,
    }),
  );
}
