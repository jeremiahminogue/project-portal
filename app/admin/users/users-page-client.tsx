"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import {
  Search,
  UserPlus,
  ShieldCheck,
  MailCheck,
  Clock,
  FolderOpen,
  ArrowRight,
  Loader2,
  X,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { initialsFor } from "@/lib/auth/initials";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createUserAction } from "../actions";
import type { AdminUserRow, AdminProjectRow } from "@/lib/queries";

type Filter = "all" | "active" | "pending" | "superadmin";

/**
 * Users list with search, filter tabs, and a "Create user" slide-over.
 *
 * Design choices:
 *  - Tabs are status filters ("All / Active / Pending / Admins"), not URL
 *    routes — this keeps the URL clean and the filter state cheap.
 *  - Search is purely client-side over the loaded set; the list is small
 *    (tens to low hundreds of users) so server-side search isn't worth it.
 *  - The create-user panel is inline (not a page navigation). When it
 *    submits, the server action redirects into the detail page, which
 *    gives the operator a chance to assign project access immediately.
 */
export function UsersPageClient({
  users,
  projects,
}: {
  users: AdminUserRow[];
  projects: AdminProjectRow[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const counts = useMemo(() => {
    let active = 0,
      pending = 0,
      admins = 0;
    for (const u of users) {
      if (u.isSuperadmin) admins += 1;
      if (u.emailConfirmed && u.hasProjectAccess) active += 1;
      if (!u.emailConfirmed || !u.hasProjectAccess) pending += 1;
    }
    return { all: users.length, active, pending, admins };
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "active" && !(u.emailConfirmed && u.hasProjectAccess))
        return false;
      if (filter === "pending" && u.emailConfirmed && u.hasProjectAccess)
        return false;
      if (filter === "superadmin" && !u.isSuperadmin) return false;
      if (!q) return true;
      const hay = [u.email, u.fullName ?? "", u.company ?? "", u.title ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, filter, query]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-pe-body">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create accounts, reset passwords, and manage project access.
          </p>
        </div>
        <Button
          onClick={() => setCreating(true)}
          className="active:scale-[0.98] transition-transform duration-75 ease-out"
        >
          <UserPlus className="h-4 w-4" />
          Add user
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
          label="Active"
          count={counts.active}
          active={filter === "active"}
          onClick={() => setFilter("active")}
          icon={CheckCircle2}
        />
        <FilterTab
          label="Pending"
          count={counts.pending}
          active={filter === "pending"}
          onClick={() => setFilter("pending")}
          icon={Clock}
        />
        <FilterTab
          label="Admins"
          count={counts.admins}
          active={filter === "superadmin"}
          onClick={() => setFilter("superadmin")}
          icon={ShieldCheck}
        />

        <div className="ml-auto relative w-full max-w-xs">
          <Search className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, company…"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
      </div>

      <UserList rows={filtered} totalProjects={projects.length} />

      {creating && (
        <CreateUserPanel
          projects={projects}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

function FilterTab({
  label,
  count,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
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
      {Icon && <Icon className="h-3.5 w-3.5" />}
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
// User list
// ---------------------------------------------------------------------------

function UserList({
  rows,
  totalProjects,
}: {
  rows: AdminUserRow[];
  totalProjects: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-white/60 p-10 text-center">
        <p className="text-sm font-medium text-pe-body">No users match.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Try clearing the search or switching filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm">
      <div className="hidden grid-cols-[1.6fr_1.1fr_1fr_0.9fr_auto] gap-4 border-b border-border/70 bg-muted/30 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:grid">
        <span>Person</span>
        <span>Company / Title</span>
        <span>Access</span>
        <span>Status</span>
        <span className="text-right">&nbsp;</span>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.map((u, idx) => (
          <li
            key={u.id}
            className="animate-in fade-in slide-in-from-bottom-1"
            style={{
              animationDuration: "320ms",
              animationDelay: `${Math.min(idx, 8) * 25}ms`,
              animationFillMode: "both",
            }}
          >
            <Link
              href={`/admin/users/${u.id}`}
              className="group grid grid-cols-1 gap-2 px-5 py-4 transition-colors hover:bg-pe-green/5 md:grid-cols-[1.6fr_1.1fr_1fr_0.9fr_auto] md:items-center md:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 flex-shrink-0">
                  <AvatarFallback className="text-[11px] bg-pe-green/10 text-pe-green-dark">
                    {initialsFor({ full_name: u.fullName }, u.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-pe-body">
                      {u.fullName ?? u.email.split("@")[0]}
                    </p>
                    {u.isSuperadmin && (
                      <Badge variant="green" className="gap-1 px-1.5 py-0">
                        <ShieldCheck className="h-3 w-3" />
                        Admin
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email}
                  </p>
                </div>
              </div>

              <div className="min-w-0 text-xs text-muted-foreground">
                {u.company ? (
                  <span className="block truncate text-pe-body">
                    {u.company}
                  </span>
                ) : (
                  <span className="block truncate text-muted-foreground/70">
                    —
                  </span>
                )}
                {u.title && (
                  <span className="block truncate text-[11px] text-muted-foreground/80">
                    {u.title}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" />
                {u.isSuperadmin ? (
                  <span>
                    All projects
                    <span className="ml-1 text-[10px] text-muted-foreground/70">
                      ({totalProjects})
                    </span>
                  </span>
                ) : u.projectCount === 0 ? (
                  <span className="text-amber-700">No access</span>
                ) : (
                  <span>
                    {u.projectCount}{" "}
                    {u.projectCount === 1 ? "project" : "projects"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {!u.emailConfirmed ? (
                  <Badge variant="amber" className="gap-1">
                    <Clock className="h-3 w-3" />
                    Unconfirmed
                  </Badge>
                ) : u.lastSignInAt ? (
                  <Badge variant="green" className="gap-1">
                    <MailCheck className="h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="gray" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    Invited
                  </Badge>
                )}
              </div>

              <div className="hidden items-center justify-end text-muted-foreground/60 group-hover:text-pe-green md:flex">
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create user slide-over
// ---------------------------------------------------------------------------

function CreateUserPanel({
  projects,
  onClose,
}: {
  projects: AdminProjectRow[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createUserAction(fd);
      if (res && !res.ok) setError(res.error);
      // On success, the server action redirects — we won't get here.
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-pe-charcoal/30 backdrop-blur-[2px] animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Create user"
        className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300 ease-out"
      >
        <header className="flex items-center justify-between border-b border-border/70 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-pe-body">
              Add a user
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Creates an account with a password. Email is pre-confirmed — they
              can sign in right away.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-pe-body"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form
          onSubmit={onSubmit}
          className="flex flex-1 flex-col overflow-y-auto"
          noValidate
        >
          <div className="flex-1 space-y-5 px-6 py-5">
            <Field label="Full name" hint="Optional — they can set their own later.">
              <Input
                name="fullName"
                placeholder="Jane Doe"
                autoComplete="off"
                disabled={isPending}
              />
            </Field>

            <Field label="Email" required>
              <Input
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="jane@company.com"
                disabled={isPending}
              />
            </Field>

            <Field
              label="Temporary password"
              required
              hint="Share this with them securely. They can change it after signing in."
            >
              <div className="relative">
                <Input
                  name="password"
                  type={showPw ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="off"
                  placeholder="At least 8 characters"
                  disabled={isPending}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-pe-sub transition-colors hover:text-pe-body"
                >
                  {showPw ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Company">
                <Input name="company" placeholder="Acme Inc." disabled={isPending} />
              </Field>
              <Field label="Title">
                <Input
                  name="title"
                  placeholder="Project Manager"
                  disabled={isPending}
                />
              </Field>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-pe-green" />
                <div>
                  <p className="text-xs font-medium text-pe-body">
                    Project access
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    After creating, you'll land on their detail page where you
                    can grant access to any of the{" "}
                    <span className="font-semibold text-pe-body">
                      {projects.length}
                    </span>{" "}
                    existing{" "}
                    {projects.length === 1 ? "project" : "projects"}.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 animate-in fade-in slide-in-from-top-1 duration-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border/70 px-6 py-3">
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
              disabled={isPending}
              className="active:scale-[0.98] transition-transform duration-75 ease-out"
            >
              {isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  Create user
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-pe-body">
        {label}
        {required && <span className="ml-0.5 text-pe-green">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
