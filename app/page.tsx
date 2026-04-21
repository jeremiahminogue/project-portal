import Link from "next/link";
import { MapPin, Users, CheckSquare2, AlertCircle } from "lucide-react";
import { AppHeader } from "@/components/pe/app-header";
import { PageShell } from "@/components/pe/page-shell";
import { GlassCard } from "@/components/pe/glass-card";
import { StatusChip } from "@/components/pe/status-chip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getProjects } from "@/lib/queries";
import { getCurrentUser, initialsFor } from "@/lib/auth/user";

export default async function DashboardPage() {
  // Kick off both fetches in parallel — they don't depend on each other.
  const [projects, me] = await Promise.all([getProjects(), getCurrentUser()]);
  const userEmail = me.user?.email ?? undefined;
  const userInitials = initialsFor(me.profile, me.user?.email ?? null);
  return (
    <>
      <AppHeader userInitials={userInitials} userEmail={userEmail} />
      <PageShell>
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-pe-body">Your projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pueblo Electric</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group"
            >
              <GlassCard className="h-full cursor-pointer transition-all duration-200 group-hover:shadow-lg group-hover:-translate-y-1">
                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
                      {project.number}
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-pe-body line-clamp-2">
                      {project.title}
                    </h3>
                  </div>

                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <div className="leading-tight">
                      <div>{project.address}</div>
                      <div className="text-[11px]">{project.owner}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusChip label={project.status} />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground uppercase tracking-[0.1em]">
                        Complete
                      </span>
                      <span className="font-medium text-pe-body">
                        {project.completionPercent}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-border/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-pe-green transition-all"
                        style={{ width: `${project.completionPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-pe-body">
                      Next:{" "}
                    </span>
                    {project.nextMilestone} ·{" "}
                    {new Date(project.nextMilestoneDate).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric" }
                    )}
                  </div>

                  <div className="flex gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <CheckSquare2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {project.openSubmittals} submittals
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {project.openRfis} RFIs
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {project.actionItems} actions
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-border/40 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-6 w-6 flex-shrink-0">
                          <AvatarFallback className="text-[9px]">
                            {project.lastActivityAuthor}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] text-muted-foreground truncate">
                            {project.lastActivity}
                          </p>
                          <p className="text-[10px] text-muted-foreground/70">
                            {project.lastActivityTime}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      </PageShell>
    </>
  );
}
