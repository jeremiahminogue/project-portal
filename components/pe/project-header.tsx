import { MapPin } from "lucide-react";
import { StatusChip } from "./status-chip";
import type { Project } from "@/data/types";

export function ProjectHeader({ project }: { project: Project }) {
  return (
    <section className="relative overflow-hidden border-b border-border/70 bg-white">
      <div className="absolute inset-0 -z-10 opacity-[0.04]">
        <div className="h-full w-full accent-band" />
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <span>{project.number}</span>
            <span>·</span>
            <StatusChip label={project.status} />
          </div>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-pe-body">
            {project.title}
          </h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {project.address} · {project.owner}
          </p>
        </div>
        <div className="flex items-center gap-8">
          <Metric label="Complete" value={`${project.completionPercent}%`} />
          <div className="hidden h-10 w-px bg-border/70 md:block" />
          <Metric label="Target" value={prettyDate(project.targetComplete)} />
          <div className="hidden h-10 w-px bg-border/70 md:block" />
          <Metric
            label="Next milestone"
            value={`${project.nextMilestone} · ${prettyDate(project.nextMilestoneDate)}`}
          />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium text-pe-body">{value}</div>
    </div>
  );
}

function prettyDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
