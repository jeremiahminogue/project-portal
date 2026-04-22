"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  Search,
  Plus,
  Folder,
  Users,
  MapPin,
  ArrowRight,
  Loader2,
  X,
  AlertCircle,
  Sparkles,
  FolderPlus,
  Hash,
  Briefcase,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createProjectAction } from "./actions";
import type { AdminProjectListRow } from "@/lib/queries";

type Phase = "pre_con" | "design" | "construction" | "closeout";
type Filter = "all" | Phase;

const PHASE_META: Record<
  Phase,
  { label: string; variant: "green" | "amber" | "blue" | "gray" }
> = {
  pre_con: { label: "Pre-Con", variant: "green" },
  design: { label: "Design", variant: "amber" },
  construction: { label: "Construction", variant: "blue" },
  closeout: { label: "Closed", variant: "gray" },
};

const PHASE_OPTIONS: { value: Phase; label: string; hint: string }[] = [
  { value: "pre_con", label: "Pre-Con", hint: "Design hasn't started" },
  { value: "design", label: "Design", hint: "Active design phase" },
  { value: "construction", label: "Construction", hint: "Field work underway" },
  { value: "closeout", label: "Closed", hint: "Project is complete" },
];

/**
 * The projects list + "Create project" slide-over.
 *
 * Same shape as the users list:
 *  - Filter tabs map to project phases (plus an "All" tab).
 *  - Client-side search across name / slug / customer / address.
 *  - "Create project" panel is inline; submit redirects into the detail page
 *    so the operator can grant access right away.
 */
export function ProjectsPageClient({
  projects,
}: {
  projects: AdminProjectListRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    const out = { all: projects.length, pre_con: 0, design: 0, construction: 0, closeout: 0 };
    for (const p of projects) {
      out[p.phase] += 1;
    }
    return out;
  }, [projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (filter !== "all" && p.phase !== filter) return false;
      if (!q) return true;
      const hay = [p.name, p.slug, p.customer, p.address ?? "", p.customerRep ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [projects, filter, query]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-pe-body">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and maintain every Pueblo Electric project. Grant customer
            teams access from the detail screen.
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="active:scale-[0.98] transition-transform duration-75 ease-out"
        >
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <FilterTab
          label="All"
          count={counts.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterTab
          label="Pre-Con"
          count={counts.pre_con}
          active={filter === "pre_con"}
          onClick={() => setFilter("pre_con")}
        />
        <FilterTab
          label="Design"
          count={counts.design}
          active={filter === "design"}
          onClick={() => setFilter("design")}
        />
        <FilterTab
          label="Construction"
          count={counts.construction}
          active={filter === "construction"}
          onClick={() => setFilter("construction")}
        />
        <FilterTab
          label="Closed"
          count={counts.closeout}
          active={filter === "closeout"}
          onClick={() => setFilter("closeout")}
        />

        <div className="ml-auto relative w-full max-w-xs">
          <Search className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, number, customer…"
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyFirstProjectCard onCreate={() => setCreating(true)} />
      ) : (
        <ProjectList rows={filtered} />
      )}

      {creating && <CreateProjectPanel onClose={() => setCreating(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs (same shape as /admin/users)
// ---------------------------------------------------------------------------

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
        active
          ? "border-pe-green bg-pe-green/10 text-pe-green-dark shadow-sm"
          : "border-border bg-white text-pe-sub hover:border-pe-green/40 hover:text-pe-body",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
          active
            ? "bg-pe-green/20 text-pe-green-dark"
            : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Project list
// ---------------------------------------------------------------------------

function ProjectList({ rows }: { rows: AdminProjectListRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-white/60 p-10 text-center">
        <p className="text-sm font-medium text-pe-body">No projects match.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try clearing the search or switching filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm">
      <div className="hidden grid-cols-[2fr_1.2fr_1fr_0.9fr_auto] gap-4 border-b border-border/70 bg-muted/30 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:grid">
        <span>Project</span>
        <span>Customer</span>
        <span>Phase</span>
        <span>Members</span>
        <span className="text-right">&nbsp;</span>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((p, idx) => (
          <li
            key={p.id}
            className="animate-in fade-in slide-in-from-bottom-1"
            style={{
              animationDuration: "320ms",
              animationDelay: `${Math.min(idx, 8) * 25}ms`,
              animationFillMode: "both",
            }}
          >
            <Link
              href={`/admin/projects/${p.id}`}
              className="group grid grid-cols-1 gap-2 px-5 py-4 transition-colors hover:bg-pe-green/5 md:grid-cols-[2fr_1.2fr_1fr_0.9fr_auto] md:items-center md:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pe-green/20 to-white border border-pe-green/20">
                  <Folder className="h-4.5 w-4.5 text-pe-green" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      #{p.slug}
                    </span>
                    {p.percentComplete > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        · {p.percentComplete}%
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-semibold text-pe-body group-hover:text-pe-green-dark transition-colors">
                    {p.name}
                  </p>
                  {p.address && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      {p.address}
                    </p>
                  )}
                </div>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-pe-body">{p.customer}</p>
                {p.customerRep && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {p.customerRep}
                  </p>
                )}
              </div>
              <div>
                <Badge variant={PHASE_META[p.phase].variant}>
                  {PHASE_META[p.phase].label}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>
                  {p.memberCount} {p.memberCount === 1 ? "member" : "members"}
                </span>
              </div>
              <div className="flex items-center justify-end">
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-pe-green" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state (when no projects exist at all)
// ---------------------------------------------------------------------------

function EmptyFirstProjectCard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-pe-green/20 bg-gradient-to-br from-pe-green/5 via-white to-white p-10 text-center shadow-sm">
      <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-pe-green/15 blur-3xl" />
      <div className="relative">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-pe-green/25 bg-white shadow-sm">
          <FolderPlus className="h-5 w-5 text-pe-green" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-pe-body">
          No projects yet
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Create your first project, then grant customer teams access from the
          detail screen.
        </p>
        <Button
          onClick={onCreate}
          className="mt-4 active:scale-[0.98] transition-transform duration-75 ease-out"
        >
          <Plus className="h-4 w-4" />
          Create first project
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create panel — inline slide-over
// ---------------------------------------------------------------------------

function CreateProjectPanel({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>("pre_con");

  // Auto-suggest slug from name. If the operator has typed anything into the
  // slug field, we stop overwriting.
  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) {
      const suggested = v
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 64);
      setSlug(suggested);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // Force the controlled slug in case the visible input diverged.
    fd.set("slug", slug);
    fd.set("name", name);
    fd.set("phase", phase);
    setError(null);
    startTransition(async () => {
      const res = await createProjectAction(fd);
      if (res && !res.ok) {
        setError(res.error);
      }
      // Success redirects into the detail page — we won't land here.
    });
  }

  return (
    <>
      {/* Scrim */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={() => {
          if (!isPending) onClose();
        }}
        aria-hidden="true"
      />
      {/* Slide-over */}
      <aside
        role="dialog"
        aria-label="Create project"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border/80 bg-white shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/70 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-pe-green/10">
                <Sparkles className="h-3.5 w-3.5 text-pe-green" />
              </div>
              <h2 className="text-base font-semibold text-pe-body">
                New project
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Create the project record. You'll grant team access next.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-pe-body disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-pe-body">
                Project name <span className="text-destructive">*</span>
              </label>
              <Input
                name="name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Colorado State Fairgrounds — Fire Alarm"
                autoFocus
                required
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-pe-body">
                Project number / slug <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Hash className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-3 h-4 w-4 text-muted-foreground" />
                <Input
                  name="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.toLowerCase());
                    setSlugTouched(true);
                  }}
                  placeholder="1646"
                  required
                  disabled={isPending}
                  className="pl-9 font-mono text-xs"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Used in URLs (e.g. <span className="font-mono">/projects/{slug || "1646"}</span>).
                Lowercase letters, numbers, dashes, underscores.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-pe-body">
                Customer <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Briefcase className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-3 h-4 w-4 text-muted-foreground" />
                <Input
                  name="customer"
                  placeholder="CO Dept. of Agriculture"
                  required
                  disabled={isPending}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-pe-body">
                Customer rep
              </label>
              <Input
                name="customerRep"
                placeholder="Nick Palaski"
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-pe-body">
                Address
              </label>
              <Input
                name="address"
                placeholder="1001 Beulah Ave, Pueblo CO"
                disabled={isPending}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-pe-body">
                Phase
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PHASE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPhase(opt.value)}
                    disabled={isPending}
                    className={cn(
                      "flex flex-col items-start rounded-lg border p-2.5 text-left transition-all duration-150 disabled:opacity-60",
                      phase === opt.value
                        ? "border-pe-green bg-pe-green/5 shadow-sm"
                        : "border-border bg-white hover:border-pe-green/40",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge variant={PHASE_META[opt.value].variant}>
                        {opt.label}
                      </Badge>
                    </div>
                    <span className="mt-1 text-[11px] text-muted-foreground">
                      {opt.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-pe-body">
                  Next milestone
                </label>
                <Input
                  name="nextMilestone"
                  placeholder="BCER Review"
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-pe-body">
                  Target date
                </label>
                <Input
                  name="nextMilestoneDate"
                  type="date"
                  disabled={isPending}
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-2.5 text-xs text-destructive animate-in fade-in slide-in-from-top-1 duration-200"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border/70 bg-muted/20 px-6 py-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !name || !slug}
              className="active:scale-[0.98] transition-transform duration-75 ease-out"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create project
                </>
              )}
            </Button>
          </footer>
        </form>
      </aside>
    </>
  );
}
