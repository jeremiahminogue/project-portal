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
  CheckCircle2,
  ChevronDown,
  Folder,
  Hash,
  Loader2,
  MapPin,
  Plus,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/pe/glass-card";
import { initialsFor } from "@/lib/auth/initials";
import { cn } from "@/lib/utils";
import type {
  AdminProfileLite,
  AdminProjectDetail,
  AdminProjectMemberRow,
} from "@/lib/queries";
import {
  grantProjectAccessAction,
  revokeProjectAccessAction,
  updateMembershipRoleAction,
} from "../../actions";
import {
  deleteProjectAction,
  updateProjectAction,
} from "../actions";

type Role = "admin" | "member" | "guest" | "readonly";
type Phase = "pre_con" | "design" | "construction" | "closeout";

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Can invite + manage files" },
  { value: "member", label: "Member", hint: "Full collaborator access" },
  { value: "guest", label: "Guest", hint: "Limited read + comment" },
  { value: "readonly", label: "Read-only", hint: "View only" },
];

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
 * Project detail surface. Four cards, mirror of the user detail page:
 *   1. Identity header (name / slug / customer at a glance)
 *   2. Edit form (all the fields on the projects row)
 *   3. Members (current memberships + "add member" picker)
 *   4. Danger zone (delete with slug confirmation)
 *
 * Every mutation is a server action, wrapped in `useTransition()` with a
 * small StatusBanner so the user sees the outcome without a full reload.
 */
export function ProjectDetailClient({
  detail,
  allProfiles,
}: {
  detail: AdminProjectDetail;
  allProfiles: AdminProfileLite[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <IdentityHeader detail={detail} />
        <MembersCard detail={detail} allProfiles={allProfiles} />
      </div>
      <div className="space-y-6">
        <EditProjectCard detail={detail} />
        <DangerZoneCard detail={detail} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity header
// ---------------------------------------------------------------------------

function IdentityHeader({ detail }: { detail: AdminProjectDetail }) {
  return (
    <GlassCard className="flex flex-wrap items-center gap-4">
      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pe-green/20 to-white border border-pe-green/20">
        <Folder className="h-6 w-6 text-pe-green" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            #{detail.slug}
          </span>
          <Badge variant={PHASE_META[detail.phase].variant}>
            {PHASE_META[detail.phase].label}
          </Badge>
          {detail.percentComplete > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {detail.percentComplete}% complete
            </span>
          )}
        </div>
        <h1 className="mt-0.5 text-xl font-semibold text-pe-body">
          {detail.name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {detail.customer}
          {detail.customerRep && (
            <span className="text-xs"> · {detail.customerRep}</span>
          )}
        </p>
        {detail.address && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {detail.address}
          </p>
        )}
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <div>
          Created{" "}
          <span className="text-pe-body">{formatShortDate(detail.createdAt)}</span>
        </div>
        <div>
          Updated{" "}
          <span className="text-pe-body">{formatShortDate(detail.updatedAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-1">
          <Users className="h-3 w-3" />
          <span>
            {detail.members.length}{" "}
            {detail.members.length === 1 ? "member" : "members"}
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
// Edit project card
// ---------------------------------------------------------------------------

function EditProjectCard({ detail }: { detail: AdminProjectDetail }) {
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [phase, setPhase] = useState<Phase>(detail.phase);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("projectId", detail.id);
    fd.set("phase", phase);
    setBanner(null);
    startTransition(async () => {
      const res = await updateProjectAction(fd);
      setBanner(
        res.ok
          ? { kind: "success", message: "Project updated." }
          : { kind: "error", message: res.error },
      );
    });
  }

  return (
    <GlassCard>
      <SectionHeader
        title="Details"
        subtitle="Edit the project record. Changes apply immediately."
      />
      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-pe-body">
            Project name <span className="text-destructive">*</span>
          </label>
          <Input
            name="name"
            defaultValue={detail.name}
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
              defaultValue={detail.slug}
              required
              disabled={isPending}
              className="pl-9 font-mono text-xs"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Changing this changes the project URL. Existing bookmarks will 404.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-pe-body">
            Customer <span className="text-destructive">*</span>
          </label>
          <Input
            name="customer"
            defaultValue={detail.customer}
            required
            disabled={isPending}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-pe-body">
              Customer rep
            </label>
            <Input
              name="customerRep"
              defaultValue={detail.customerRep ?? ""}
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-pe-body">
              % complete
            </label>
            <Input
              name="percentComplete"
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={String(detail.percentComplete)}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-pe-body">
            Address
          </label>
          <Input
            name="address"
            defaultValue={detail.address ?? ""}
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
              defaultValue={detail.nextMilestone ?? ""}
              placeholder="Upcoming milestone"
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
              defaultValue={
                detail.nextMilestoneDate
                  ? detail.nextMilestoneDate.slice(0, 10)
                  : ""
              }
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
                Save changes
              </>
            )}
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Members card
// ---------------------------------------------------------------------------

function MembersCard({
  detail,
  allProfiles,
}: {
  detail: AdminProjectDetail;
  allProfiles: AdminProfileLite[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const memberUserIds = useMemo(
    () => new Set(detail.members.map((m) => m.userId)),
    [detail.members],
  );

  const addableProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allProfiles
      .filter((p) => !memberUserIds.has(p.id))
      .filter((p) => {
        if (!q) return true;
        const hay = [p.email, p.fullName ?? "", p.company ?? ""]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const an = (a.fullName ?? a.email).toLowerCase();
        const bn = (b.fullName ?? b.email).toLowerCase();
        return an.localeCompare(bn);
      });
  }, [allProfiles, memberUserIds, query]);

  function grant(userId: string, role: Role) {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("projectId", detail.id);
    fd.set("role", role);
    setBanner(null);
    startTransition(async () => {
      const res = await grantProjectAccessAction(fd);
      if (res.ok) {
        setBanner({ kind: "success", message: "Member added." });
        router.refresh();
      } else {
        setBanner({ kind: "error", message: res.error });
      }
    });
  }

  function revoke(m: AdminProjectMemberRow) {
    const fd = new FormData();
    fd.set("userId", m.userId);
    fd.set("membershipId", m.membershipId);
    setBanner(null);
    startTransition(async () => {
      const res = await revokeProjectAccessAction(fd);
      if (res.ok) {
        setBanner({
          kind: "success",
          message: `Removed ${m.fullName ?? m.email}.`,
        });
        router.refresh();
      } else {
        setBanner({ kind: "error", message: res.error });
      }
    });
  }

  function changeRole(m: AdminProjectMemberRow, role: Role) {
    const fd = new FormData();
    fd.set("userId", m.userId);
    fd.set("membershipId", m.membershipId);
    fd.set("role", role);
    setBanner(null);
    startTransition(async () => {
      const res = await updateMembershipRoleAction(fd);
      if (res.ok) {
        setBanner({ kind: "success", message: "Role updated." });
        router.refresh();
      } else {
        setBanner({ kind: "error", message: res.error });
      }
    });
  }

  return (
    <GlassCard>
      <SectionHeader
        title="Members"
        subtitle="Grant specific users access to this project. Superadmins always see it."
      />

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Current members
        </h3>
        {detail.members.length === 0 ? (
          <div className="mt-2 rounded-lg border border-dashed border-border/70 bg-white/40 p-4 text-center">
            <p className="text-sm text-muted-foreground">No members yet.</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Add the customer team below so they can see the project.
            </p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-white">
            {detail.members.map((m) => (
              <li
                key={m.membershipId}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-pe-green/10 text-pe-green-dark text-[10px] font-semibold">
                    {initialsFor({ full_name: m.fullName }, m.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-pe-body">
                      {m.fullName ?? m.email.split("@")[0]}
                    </p>
                    {m.isSuperadmin && (
                      <Badge variant="green" className="gap-1 px-1.5 py-0 text-[9px]">
                        <ShieldCheck className="h-2.5 w-2.5" />
                        SA
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {m.email}
                    {m.company && <span> · {m.company}</span>}
                  </p>
                </div>
                <RolePicker
                  role={m.role}
                  disabled={isPending}
                  onChange={(r) => changeRole(m, r)}
                />
                <button
                  type="button"
                  onClick={() => revoke(m)}
                  disabled={isPending}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                  aria-label={`Remove ${m.fullName ?? m.email}`}
                  title="Remove member"
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
          Add a member
        </h3>

        {allProfiles.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No users exist yet. Create one from the Users tab first.
          </p>
        ) : (
          <>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email, or company…"
                className="pl-9"
                aria-label="Search users"
              />
            </div>
            <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-border/60 rounded-lg border border-border/70 bg-white">
              {addableProfiles.length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {query
                    ? "No matching users."
                    : "Every user is already a member."}
                </li>
              ) : (
                addableProfiles.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarFallback className="bg-muted text-[9px] font-semibold text-muted-foreground">
                        {initialsFor({ full_name: p.fullName }, p.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-pe-body">
                          {p.fullName ?? p.email.split("@")[0]}
                        </p>
                        {p.isSuperadmin && (
                          <Badge variant="green" className="gap-1 px-1.5 py-0 text-[9px]">
                            <ShieldCheck className="h-2.5 w-2.5" />
                            SA
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p.email}
                        {p.company && <span> · {p.company}</span>}
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

function DangerZoneCard({ detail }: { detail: AdminProjectDetail }) {
  const [isPending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState("");
  const [armed, setArmed] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const confirmValue = detail.slug;
  const canDelete = armed && confirmText === confirmValue;

  function onDelete() {
    if (!canDelete) return;
    const fd = new FormData();
    fd.set("projectId", detail.id);
    setBanner(null);
    startTransition(async () => {
      const res = await deleteProjectAction(fd);
      if (res && !res.ok) {
        setBanner({ kind: "error", message: res.error });
      }
      // Success redirects to /admin/projects — we won't land here.
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
            Deletes the project and every piece of work attached to it —
            members, files, schedule, submittals, RFIs, chat. This can't be
            undone. R2-stored files remain but become orphans.
          </p>
        </div>
      </div>

      {!armed && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3 border-destructive/30 text-destructive hover:bg-destructive/5"
          onClick={() => setArmed(true)}
        >
          <Trash2 className="h-4 w-4" />
          Delete project
        </Button>
      )}

      {armed && (
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
