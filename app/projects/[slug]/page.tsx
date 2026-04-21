import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Calendar,
  Folder,
  FileCheck2,
  MessageSquare,
  Newspaper,
  Users,
  ChevronRight,
  Clock,
} from "lucide-react";
import { PageShell } from "@/components/pe/page-shell";
import { GlassCard } from "@/components/pe/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CardTitle, CardDescription } from "@/components/ui/card";
import { getProject, getSchedule, getUpdates } from "@/lib/queries";
import type { ScheduleActivity } from "@/data/types";

const TODAY = new Date("2026-04-21");
const LOOK_AHEAD_DAYS = 21;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getWeekLabel(date: Date): string {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function groupActivitiesByWeek(
  activities: ScheduleActivity[],
  today: Date,
  days: number
): [string, ScheduleActivity[]][] {
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + days);

  const filtered = activities.filter((a) => {
    const start = new Date(a.startDate);
    return start >= today && start <= endDate;
  });

  const grouped = new Map<string, ScheduleActivity[]>();
  filtered.forEach((activity) => {
    const start = new Date(activity.startDate);
    const weekLabel = getWeekLabel(start);
    if (!grouped.has(weekLabel)) {
      grouped.set(weekLabel, []);
    }
    grouped.get(weekLabel)!.push(activity);
  });

  return Array.from(grouped.entries());
}

export default async function ProjectHomePage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProject(params.slug);
  if (!project) {
    notFound();
  }

  const [scheduleActivities, updates] = await Promise.all([
    getSchedule(params.slug),
    getUpdates(params.slug),
  ]);

  const nextMilestoneDate = new Date(project.nextMilestoneDate);
  const daysUntil = Math.ceil(
    (nextMilestoneDate.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24)
  );

  const weeklyActivities = groupActivitiesByWeek(scheduleActivities, TODAY, LOOK_AHEAD_DAYS);

  const recentUpdates = updates.slice(0, 6);

  const quickNavTiles = [
    {
      label: "Files",
      icon: Folder,
      href: `/projects/${params.slug}/files`,
      count: undefined,
    },
    {
      label: "Schedule",
      icon: Calendar,
      href: `/projects/${params.slug}/schedule`,
      count: undefined,
    },
    {
      label: "Submittals",
      icon: FileCheck2,
      href: `/projects/${params.slug}/submittals`,
      count: project.openSubmittals,
    },
    {
      label: "Updates",
      icon: Newspaper,
      href: `/projects/${params.slug}/updates`,
      count: undefined,
    },
    {
      label: "Chat",
      icon: MessageSquare,
      href: `/projects/${params.slug}/chat`,
      count: undefined,
    },
    {
      label: "Directory",
      icon: Users,
      href: `/projects/${params.slug}/directory`,
      count: undefined,
    },
  ];

  return (
    <PageShell>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <GlassCard>
            <div className="space-y-2 mb-4">
              <div className="text-xs uppercase tracking-[0.1em] text-muted-foreground font-semibold">
                Next milestone
              </div>
              <h3 className="text-xl font-semibold text-pe-body">
                {project.nextMilestone}
              </h3>
            </div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="text-3xl font-bold text-pe-green">
                {nextMilestoneDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="text-sm text-muted-foreground">
                T-minus{" "}
                <span className="font-semibold text-pe-body">{daysUntil}</span>{" "}
                {daysUntil === 1 ? "day" : "days"}
              </span>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/projects/${params.slug}/schedule`}>
                View on schedule <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </GlassCard>

          <GlassCard>
            <div className="mb-4">
              <CardTitle className="text-base">3-week look-ahead</CardTitle>
            </div>
            <div className="space-y-4">
              {weeklyActivities.length > 0 ? (
                weeklyActivities.map(([weekLabel, activities]) => (
                  <div key={weekLabel}>
                    <div className="text-xs uppercase tracking-[0.1em] text-muted-foreground font-semibold mb-2">
                      {weekLabel}
                    </div>
                    <div className="space-y-2">
                      {activities.slice(0, 3).map((activity) => (
                        <div
                          key={activity.id}
                          className="text-sm bg-white/50 rounded p-2.5"
                        >
                          <div className="flex items-start gap-2">
                            <Badge variant={activity.status} className="text-[10px] flex-shrink-0 mt-0.5">
                              {activity.phase.split(" ")[0]}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-pe-body truncate">
                                {activity.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(activity.startDate)} –{" "}
                                {formatDate(activity.endDate)} · {activity.owner}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No activities scheduled in the next 3 weeks
                </p>
              )}
            </div>
          </GlassCard>

          <GlassCard>
            <div className="mb-4">
              <CardTitle className="text-base">Activity feed</CardTitle>
            </div>
            <div className="space-y-3">
              {recentUpdates.map((update) => (
                <div
                  key={update.id}
                  className="text-sm bg-white/50 rounded p-3 border border-border/40"
                >
                  <div className="flex items-start gap-2.5">
                    <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                      <AvatarFallback className="text-[10px]">
                        {update.author
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-pe-body leading-tight">
                        {update.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {update.author} · {update.postedTime}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {quickNavTiles.map(({ label, icon: Icon, href, count }) => (
              <Link
                key={label}
                href={href}
                className="group"
              >
                <GlassCard className="h-full cursor-pointer transition-all hover:shadow-md">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Icon className="h-5 w-5 text-pe-green" />
                    <span className="text-xs font-medium text-pe-body">
                      {label}
                    </span>
                    {count !== undefined && count > 0 && (
                      <Badge variant="amber" className="text-[9px]">
                        {count} open
                      </Badge>
                    )}
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>

          <GlassCard>
            <div className="mb-3">
              <CardTitle className="text-sm">People</CardTitle>
              <CardDescription className="text-xs">
                Project team members
              </CardDescription>
            </div>
            <div className="flex gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Avatar key={i} className="h-7 w-7 border border-border">
                  <AvatarFallback className="text-[9px]">
                    {String.fromCharCode(64 + i)}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <Button
              variant="link"
              size="sm"
              asChild
              className="h-auto p-0 text-xs"
            >
              <Link href={`/projects/${params.slug}/directory`}>
                +8 more members →
              </Link>
            </Button>
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}
