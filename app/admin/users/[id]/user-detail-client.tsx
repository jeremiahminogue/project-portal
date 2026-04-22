"use client";

import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  Folder,
  KeyRound,
  Loader2,
  Lock,
  MailCheck,
  Plus,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/pe/glass-card";
import { initialsFor } from "@/lib/auth/initials";
import { cn } from "@/lib/utils";
import type {
  AdminMembershipRow,
  AdminProjectRow,
  AdminUserDetail,
} from "@/lib/queries";
import {
  confirmEmailAction,
  deleteUserAction,
  grantProjectAccessAction,
  revokeProjectAccessAction,
  setPasswordAction,
  setSuperadminAction,
  updateMembershipRoleAction,
  updateProfileAction,
} from "../../actions";

type Role = "admin" | "member" | "guest" | "readonly";

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Can invite + manage files" },
  { value: "member", label: "Member", hint: "Full collaborator access" },
  { value: "guest", label: "Guest", hint: "Limited read + comment" },
  { value: "readonly", label: "Read-only", hint: "View only" },
];

/**
 * The user-detail surface. One page, four cards:
 *   1. Identity / basic profile (name, company, title)
 *   2. Account (password reset, confirm email, superadmin toggle)
 *   3. Project access (current memberships + "add access" picker)
 *   4. Danger zone (delete)
 *
 * Every mutation is a server action from `../../actions.ts`. We wrap them
 * with `useTransition()` + a small local status so the UI shows a spinner
 * on the button and a toast-style banner when the action returns.
 */
export function UserDetailClient({
  detail,
  allProjects,
  isSelf,
}: {
  detail: AdminUserDetail;
  allProjects: AdminProjectRow[];
  isSelf: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <IdentityHeader detail={detail} />
        <ProjectAccessCard
          detail={detail}
          allProjects={allProjects}
        />
      </div>
      <div className="space-y-6">
        <ProfileCard detail={detail} />
        <AccountCard detail={detail} isSelf={isSelf} />
        <DangerZoneCard detail={detail} isSelf={isSelf} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity header
// ---------------------------------------------------------------------------

function IdentityHeader({ detail }: { detail: AdminUserDetail }) {
  const initials = initialsFor({ full_name: detail.fullName }, detail.email);
  return (
    <GlassCard className="flex flex-wrap items-center gap-4">
      <Avatar className="h-14 w-14">
        <AvatarFallback className="bg-pe-green/10 text-pe-green-dark text-sm font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-pe-body">
            {detail.fullName ?? detail.email.split("@")[0]}
          </h1>
          {detail.isSuperadmin && (
            <Badge variant="green" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Superadmin
            </Badge>
          )}
          {detail.emailConfirmed ? (
            <Badge variant="gray" className="gap-1">
              <MailCheck className="h-3 w-3" />
              Email confirmed
            </Badge>
          ) : (
            <Badge variant="amber" className="gap-1">
              <Clock className="h-3 w-3" />
              Unconfirmed
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{detail.email}</p>
        {(detail.company || detail.title) && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[detail.title, detail.company].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <div>
          Created{" "}
          <span className="text-pe-body">{formatShortDate(detail.createdAt)}</span>
        </div>
        <div>
          Last sign-in{" "}
          <span className="text-pe-body">
            {detail.lastSignInAt
              ? formatShortDate(detail.lastSignInAt)
              : "Never"}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Profile card
// ---------------------------------------------------------------------------

function ProfileCard({ detail }: { detail: AdminUserDetail }) {
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("userId", detail.id);
    setBanner(null);
    startTransition(async () => {
      const res = await updateProfileAction(fd);
      setBanner(
        res.ok
          ? { kind: "success", message: "Profile updated." }
          : { kind: "error", message: res.error },
      );
    });
  }

  return (
    <GlassCard>
      <SectionHeader
        title="Profile"
        subtitle="Display name and where they work."
      />
      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-pe-body">
            Full name
          </label>
          <Input
            name="fullName"
            defaultValue={detail.fullName ?? ""}
            placeholder="Jane Doe"
            disabled={isPending}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-pe-body">
              Company
            </label>
            <Input
              name="company"
              defaultValue={detail.company ?? ""}
              placeholder="Acme Inc."
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-pe-body">
              Title
            </label>
            <Input
              name="title"
              defaultValue={detail.title ?? ""}
              placeholder="Project Manager"
              disabled={isPending}
            />
          </div>
        </div>

        <StatusBanner banner={banner} />

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="secondary"
            disabled={isPending}
            className="active:scale-[0.98] transition-transform duration-75 ease-out"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save profile
              </>
            )}
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Account card — password / confirm / superadmin
// ---------------------------------------------------------------------------

function AccountCard({
  detail,
  isSelf,
}: {
  detail: AdminUserDetail;
  isSelf: boolean;
}) {
  return (
    <GlassCard className="space-y-6">
      <SectionHeader
        title="Account"
        subtitle="Credentials and platform-level powers."
      />
      <PasswordBlock userId={detail.id} />
      {!detail.emailConfirmed && <ConfirmEmailBlock userId={detail.id} />}
      <SuperadminBlock
        userId={detail.id}
        isSuperadmin={detail.isSuperadmin}
        isSelf={isSelf}
      />
    </GlassCard>
  );
}

function PasswordBlock({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState("");
  const [banner, setBanner] = useState<Banner>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("userId", userId);
    setBanner(null);
    startTransition(async () => {
      const res = await setPasswordAction(fd);
      if (res.ok) {
        setPw("");
        setBanner({ kind: "success", message: "Password updated." });
      } else {
        setBanner({ kind: "error", message: res.error });
      }
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium text-pe-body">
        <KeyRound className="h-4 w-4 text-pe-green" />
        Set password
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Overrides their current password. Deliver it to them securely.
      </p>
      <form onSubmit={onSubmit} className="mt-3 space-y-3" noValidate>
        <div className="relative">
          <Input
            name="password"
            type={showPw ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
            autoComplete="new-password"
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

        <StatusBanner banner={banner} />

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={isPending || pw.length < 8}
            className="active:scale-[0.98] transition-transform duration-75 ease-out"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Update password
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ConfirmEmailBlock({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  function onSubmit() {
    const fd = new FormData();
    fd.set("userId", userId);
    setBanner(null);
    startTransition(async () => {
      const res = await confirmEmailAction(fd);
      setBanner(
        res.ok
          ? { kind: "success", message: "Email confirmed." }
          : { kind: "error", message: res.error },
      );
    });
  }

  return (
    <div className="rounded-lg border border-amber-200/70 bg-amber-50/50 p-3">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-pe-body">
            Email not confirmed
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Skip the confirmation email and let them sign in directly.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onSubmit}
            disabled={isPending}
            className="mt-2 active:scale-[0.98] transition-transform duration-75 ease-out"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Confirming…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Mark as confirmed
              </>
            )}
          </Button>
          <StatusBanner banner={banner} className="mt-2" />
        </div>
      </div>
    </div>
  );
}

function SuperadminBlock({
  userId,
  isSuperadmin,
  isSelf,
}: {
  userId: string;
  isSuperadmin: boolean;
  isSelf: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  function toggle() {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("on", isSuperadmin ? "false" : "on");
    setBanner(null);
    startTransition(async () => {
      const res = await setSuperadminAction(fd);
      setBanner(
        res.ok
          ? {
              kind: "success",
              message: isSuperadmin
                ? "Superadmin removed."
                : "Superadmin granted. They can now see every project.",
            }
          : { kind: "error", message: res.error },
      );
    });
  }

  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-pe-green" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-pe-body">Superadmin</p>
            <button
              type="button"
              role="switch"
              aria-checked={isSuperadmin}
              onClick={toggle}
              disabled={isPending || (isSelf && isSuperadmin)}
              className={cn(
                "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-pe-green focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                isSuperadmin ? "bg-pe-green" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out",
                  isSuperadmin ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sees every project. Bypasses per-project access rules. Reserved for
            Pueblo Electric staff.
          </p>
          {isSelf && isSuperadmin && (
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              You can't remove your own superadmin until another admin exists.
            </p>
          )}
          <StatusBanner banner={banner} className="mt-2" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project access card
// ---------------------------------------------------------------------------

function ProjectAccessCard({
  detail,
  allProjects,
}: {
  detail: AdminUserDetail;
  allProjects: AdminProjectRow[];
}) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const memberByProjectId = useMemo(() => {
    const map = new Map<string, AdminMembershipRow>();
    for (const m of detail.memberships) map.set(m.projectId, m);
    return map;
  }, [detail.memberships]);

  const nonMemberProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allProjects
      .filter((p) => !memberByProjectId.has(p.id))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          p.customer.toLowerCase().includes(q)
        );
      });
  }, [allProjects, memberByProjectId, query]);

  function grant(projectId: string, role: Role) {
    const fd = new FormData();
    fd.set("userId", detail.id);
    fd.set("projectId", projectId);
    fd.set("role", role);
    setBanner(null);
    startTransition(async () => {
      const res = await grantProjectAccessAction(fd);
      setBanner(
        res.ok
          ? { kind: "success", message: "Access granted." }
          : { kind: "error", message: res.error },
      );
    });
  }

  function revoke(membershipId: string, projectName: string) {
    const fd = new FormData();
    fd.set("userId", detail.id);
    fd.set("membershipId", membershipId);
    setBanner(null);
    startTransition(async () => {
      const res = await revokeProjectAccessAction(fd);
      setBanner(
        res.ok
          ? { kind: "success", message: `Removed from ${projectName}.` }
          : { kind: "error", message: res.error },
      );
    });
  }

  function changeRole(membershipId: string, role: Role) {
    const fd = new FormData();
    fd.set("userId", detail.id);
    fd.set("membershipId", membershipId);
    fd.set("role", role);
    setBanner(null);
    startTransition(async () => {
      const res = await updateMembershipRoleAction(fd);
      setBanner(
        res.ok
          ? { kind: "success", message: "Role updated." }
          : { kind: "error", message: res.error },
      );
    });
  }

  return (
    <GlassCard>
      <SectionHeader
        title="Project access"
        subtitle={
          detail.isSuperadmin
            ? "Superadmin — already sees every project. Explicit memberships below are optional."
            : "Grant this user access to specific projects."
        }
      />

      {detail.isSuperadmin && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-pe-green/25 bg-pe-green/5 p-3 text-xs text-pe-green-dark">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <p>
            As a superadmin, they automatically see all{" "}
            <span className="font-semibold">{allProjects.length}</span>{" "}
            {allProjects.length === 1 ? "project" : "projects"} without any
            per-project membership.
          </p>
        </div>
      )}

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Current memberships
        </h3>
        {detail.memberships.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-border/70 bg-white/40 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No project memberships yet.
            </p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-white">
            {detail.memberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                <Folder className="h-4 w-4 flex-shrink-0 text-pe-green" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-pe-body">
                    {m.projectName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    #{m.projectSlug}
                  </p>
                </div>
                <RolePicker
                  role={m.role}
                  disabled={isPending}
                  onChange={(r) => changeRole(m.id, r)}
                />
                <button
                  type="button"
                  onClick={() => revoke(m.id, m.projectName)}
                  disabled={isPending}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  aria-label={`Remove access to ${m.projectName}`}
                  title="Remove access"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Grant access to a project
        </h3>

        {allProjects.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No projects exist yet.
          </p>
        ) : (
          <>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search project name, number, customer…"
                className="pl-9"
                aria-label="Search projects"
              />
            </div>
            <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-border/60 rounded-lg border border-border/70 bg-white">
              {nonMemberProjects.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {query
                    ? "No matching projects."
                    : "They already have access to every project."}
                </li>
              ) : (
                nonMemberProjects.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <Folder className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-pe-body">
                        {p.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        #{p.slug} · {p.customer}
                      </p>
                    </div>
                    <GrantButton
                      disabled={isPending}
                      onGrant={(r) => grant(p.id, r)}
                    />
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>

      <StatusBanner banner={banner} className="mt-4" />
    </GlassCard>
  );
}

function RolePicker({
  role,
  disabled,
  onChange,
}: {
  role: Role;
  disabled?: boolean;
  onChange: (r: Role) => void;
}) {
  return (
    <div className="relative">
      <select
        value={role}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Role)}
        className="h-8 appearance-none rounded-md border border-border bg-white pl-2.5 pr-7 text-xs font-medium text-pe-body transition-colors hover:border-pe-green/40 focus:border-pe-green focus:outline-none focus:ring-2 focus:ring-pe-green/30 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Role"
      >
        {ROLE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute inset-y-0 right-2 my-auto h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

function GrantButton({
  disabled,
  onGrant,
}: {
  disabled?: boolean;
  onGrant: (role: Role) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="h-8 gap-1 px-2.5 text-xs active:scale-[0.98] transition-transform duration-75 ease-out"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
        <ChevronDown className="h-3 w-3" />
      </Button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-9 z-40 w-52 overflow-hidden rounded-md border border-border/80 bg-white shadow-lg animate-in fade-in zoom-in-95 duration-150">
            {ROLE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-pe-green/5"
                onClick={() => {
                  setOpen(false);
                  onGrant(o.value);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-pe-body">{o.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {o.hint}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

function DangerZoneCard({
  detail,
  isSelf,
}: {
  detail: AdminUserDetail;
  isSelf: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [armed, setArmed] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const confirmValue = detail.email;
  const canDelete = armed && confirmText === confirmValue && !isSelf;

  function onDelete() {
    if (!canDelete) return;
    const fd = new FormData();
    fd.set("userId", detail.id);
    setBanner(null);
    startTransition(async () => {
      const res = await deleteUserAction(fd);
      if (res && !res.ok) {
        setBanner({ kind: "error", message: res.error });
      }
      // Success → server action redirects, we won't land here.
    });
  }

  return (
    <GlassCard className="border border-destructive/20 bg-destructive/[0.02]">
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
        <div>
          <h3 className="text-sm font-semibold text-destructive">
            Danger zone
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Deleting removes the account, their profile, and all project
            memberships. Files they uploaded remain, but attribution is lost.
          </p>
        </div>
      </div>

      {isSelf && (
        <p className="mt-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          You can't delete your own account from this screen.
        </p>
      )}

      {!isSelf && !armed && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/5"
          onClick={() => setArmed(true)}
        >
          <Trash2 className="h-4 w-4" />
          Delete user
        </Button>
      )}

      {!isSelf && armed && (
        <div className="mt-3 space-y-2 rounded-lg border border-destructive/30 bg-white p-3 animate-in fade-in zoom-in-95 duration-150">
          <p className="text-xs text-pe-body">
            Type{" "}
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
              {confirmValue}
            </span>{" "}
            to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={confirmValue}
            disabled={isPending}
            autoFocus
          />
          <StatusBanner banner={banner} />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setArmed(false);
                setConfirmText("");
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!canDelete || isPending}
              onClick={onDelete}
              className="active:scale-[0.98] transition-transform duration-75 ease-out"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Permanently delete
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Small shared UI
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-pe-body">{title}</h2>
      {subtitle && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

type Banner =
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | null;

function StatusBanner({
  banner,
  className,
}: {
  banner: Banner;
  className?: string;
}): ReactNode {
  if (!banner) return null;
  const isError = banner.kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border p-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-200",
        isError
          ? "border-destructive/20 bg-destructive/5 text-destructive"
          : "border-pe-green/25 bg-pe-green/5 text-pe-green-dark",
        className,
      )}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      )}
      <span>{banner.message}</span>
    </div>
  );
}
