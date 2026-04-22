import Link from "next/link";
import {
  AlertCircle,
  CheckSquare2,
  FolderPlus,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import { AppHeader } from "@/components/pe/app-header";
import { PageShell } from "@/components/pe/page-shell";
import { GlassCard } from "@/components/pe/glass-card";
import { StatusChip } from "@/components/pe/status-chip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getProjects } from "@/lib/queries";
import { getCurrentUser, initialsFor } from "@/lib/auth/user";

export default async function DashboardPage() {
  // Kick off both fetches in parallel — they don't depend on each other.
  const [projects, me] = await Promise.all([getProjects(), getCurrentUser()]);
  const userEmail = me.user?.email ?? undefined;
  const userInitials = initialsFor(me.profile, me.user?.email ?? null);
  return (
    <>
      <AppHeader
        userInitials={userInitials}
        userEmail={userEmail}
        isSuperadmin={me.isSuperadmin}
      />
      <PageShell>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-pe-body">Your projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pueblo Electric</p>
          </div>
          {me.isSuperadmin && projects.length > 0 && (
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/projects">
                <Plus className="h-4 w-4" />
                New project
              </Link>
            </Button>
          )}
        </div>

        {projects.length === 0 && (
          <EmptyProjectsState isSuperadmin={me.isSuperadmin} />
        )}

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

function EmptyProjectsState({ isSuperadmin }: { isSuperadmin: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-pe-green/20 bg-gradient-to-br from-pe-green/5 via-white to-white p-12 text-center shadow-sm">
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-pe-green/15 blur-3xl" />
      <div className="relative">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-pe-green/25 bg-white shadow-sm">
          <FolderPlus className="h-5 w-5 text-pe-green" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-pe-body">
          {isSuperadmin ? "No projects yet" : "No projects to show"}
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {isSuperadmin
            ? "Create your first project, then grant customer teams access from the admin console."
            : "You haven't been added to any projects yet. Ask your Pueblo Electric contact to grant access."}
        </p>
        {isSuperadmin && (
          <Button asChild className="mt-4 active:scale-[0.98] transition-transform duration-75 ease-out">
            <Link href="/admin/projects">
              <Plus className="h-4 w-4" />
              Create first project
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
