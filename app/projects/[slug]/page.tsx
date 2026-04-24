import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Calendar,
  Folder,
  FileCheck2,
  HelpCircle,
  MessageSquare,
  Newspaper,
  MapPin,
} from "lucide-react";
import { PageShell } from "@/components/pe/page-shell";
import { StatusChip } from "@/components/pe/status-chip";
import { getProject, getSchedule, getUpdates } from "@/lib/queries";
import type { Project, ScheduleActivity, Update } from "@/data/types";

const TODAY = new Date("2026-04-21");
const LOOK_AHEAD_DAYS = 21;

// ---- date helpers -----------------------------------------------------------

const MONTH_DAY: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

const WEEKDAY_MONTH_DAY: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "2-digit",
  day: "2-digit",
};

function formatMonthDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", MONTH_DAY);
}

function formatWeekdayDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", WEEKDAY_MONTH_DAY);
}

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

// ---- presentation helpers ---------------------------------------------------

const phaseLabels: Project["status"][] = [
  "Pre-Con",
  "Design",
  "Construction",
  "Closed",
];

const activityDotByStatus: Record<string, string> = {
  green: "bg-pe-green",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  blue: "bg-blue-500",
  purple: "bg-violet-500",
  gray: "bg-ink-300",
};

const avatarGradients = [
  "from-pe-charcoal to-pe-black",
  "from-purple-500 to-purple-700",
  "from-blue-500 to-blue-700",
  "from-amber-400 to-amber-600",
  "from-pe-green to-pe-green-dark",
  "from-rose-500 to-rose-700",
];

function hashIndex(seed: string, mod: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "PE";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// ---- page -------------------------------------------------------------------

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

  const milestoneIso = project.nextMilestoneDate || null;
  const milestoneDate = milestoneIso ? new Date(milestoneIso) : null;
  const daysUntil = milestoneDate ? daysBetween(TODAY, milestoneDate) : null;

  const lookahead = buildLookahead(scheduleActivities, TODAY, LOOK_AHEAD_DAYS);
  const recentUpdates = updates.slice(0, 5);

  const activePhaseIndex = phaseLabels.indexOf(project.status);

  return (
    <PageShell>
      <ProjectHero project={project} activePhaseIndex={activePhaseIndex} />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <NextMilestoneCard
          milestoneName={project.nextMilestone}
          milestoneDateIso={milestoneIso}
          daysUntil={daysUntil}
          slug={params.slug}
        />
        <LookaheadCard activities={lookahead} slug={params.slug} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <QuickNavTiles slug={params.slug} project={project} />
        <ActivityFeedCard updates={recentUpdates} />
      </div>
    </PageShell>
  );
}

// ---- hero -------------------------------------------------------------------

function ProjectHero({
  project,
  activePhaseIndex,
}: {
  project: Project;
  activePhaseIndex: number;
}) {
  const complete = Math.max(0, Math.min(100, project.completionPercent));

  return (
    <section className="relative overflow-hidden rounded-2xl glass-strong p-6 md:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-pe-green/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-blue-400/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip label={project.status} />
            <span className="inline-flex items-center rounded-full border border-black/5 bg-white/70 px-2.5 py-0.5 text-xs font-medium text-pe-charcoal">
              {project.number}
            </span>
          </div>
          <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-ink-900 md:text-[30px]">
            {project.title}
          </h1>
          {project.address ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-500">
              <MapPin className="h-3.5 w-3.5" />
              {project.address}
            </p>
          ) : null}
          {project.owner ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <span className="text-ink-500">Owner</span>
              <span className="font-medium text-ink-900">{project.owner}</span>
            </div>
          ) : null}
        </div>
        <div className="text-right md:pl-8">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            Overall
          </div>
          <div className="text-[32px] font-bold leading-none text-ink-900">
            {complete}%
          </div>
          <div className="text-xs text-ink-500">
            Target complete{" "}
            {project.targetComplete
              ? formatMonthDay(project.targetComplete)
              : "—"}
          </div>
        </div>
      </div>

      <div className="relative mt-6 h-1.5 overflow-hidden rounded-full bg-black/5">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-pe-green to-pe-green-dark transition-[width] duration-500"
          style={{ width: `${complete}%` }}
        />
      </div>
      <div className="relative mt-2 flex justify-between text-[11px] font-medium text-ink-500">
        {phaseLabels.map((label, i) => (
          <span
            key={label}
            className={i <= activePhaseIndex ? "text-ink-900" : undefined}
          >
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

// ---- next milestone card ----------------------------------------------------

function NextMilestoneCard({
  milestoneName,
  milestoneDateIso,
  daysUntil,
  slug,
}: {
  milestoneName: string;
  milestoneDateIso: string | null;
  daysUntil: number | null;
  slug: string;
}) {
  return (
    <article className="card-flat p-5 lg:col-span-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
        Next milestone
      </div>
      <h3 className="mt-1 text-[18px] font-semibold leading-snug text-ink-900">
        {milestoneName || "No milestone set"}
      </h3>
      {milestoneDateIso ? (
        <div className="mt-1 text-sm text-ink-500">
          {formatWeekdayDate(milestoneDateIso)}
          {daysUntil !== null ? (
            <span className="ml-2 text-ink-700">
              · T-minus{" "}
              <span className="font-semibold text-ink-900">
                {Math.max(daysUntil, 0)}
              </span>{" "}
              {daysUntil === 1 ? "day" : "days"}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4">
        <Link
          href={`/projects/${slug}/schedule`}
          className="text-[12px] font-semibold text-pe-green-dk hover:underline"
        >
          View on schedule →
        </Link>
      </div>
    </article>
  );
}

// ---- 3-week look-ahead card -------------------------------------------------

interface LookaheadItem {
  id: string;
  title: string;
  startIso: string;
  endIso: string;
  statusColor: string;
}

function buildLookahead(
  activities: ScheduleActivity[],
  today: Date,
  days: number,
): LookaheadItem[] {
  const end = new Date(today);
  end.setDate(end.getDate() + days);

  return activities
    .filter((a) => {
      const start = new Date(a.startDate);
      return start >= today && start <= end;
    })
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    )
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      title: a.title,
      startIso: a.startDate,
      endIso: a.endDate,
      statusColor: activityDotByStatus[a.status] ?? activityDotByStatus.gray,
    }));
}

function LookaheadCard({
  activities,
  slug,
}: {
  activities: LookaheadItem[];
  slug: string;
}) {
  return (
    <article className="card-flat p-5 lg:col-span-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          3-week look-ahead
        </div>
        <Link
          href={`/projects/${slug}/schedule`}
          className="text-[12px] font-semibold text-pe-green-dk hover:underline"
        >
          View schedule →
        </Link>
      </div>
      {activities.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">
          No activities scheduled in the next 3 weeks.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-black/5">
          {activities.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${a.statusColor}`}
              />
              <span className="flex-1 truncate text-[13px] text-ink-700">
                {a.title}
              </span>
              <span className="flex-shrink-0 text-[12px] text-ink-500">
                {formatRange(a.startIso, a.endIso)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function formatRange(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay) {
    return s.toLocaleDateString("en-US", WEEKDAY_MONTH_DAY);
  }
  return `${s.toLocaleDateString("en-US", WEEKDAY_MONTH_DAY)} – ${e.toLocaleDateString(
    "en-US",
    MONTH_DAY,
  )}`;
}

// ---- quick nav tiles --------------------------------------------------------

function QuickNavTiles({
  slug,
  project,
}: {
  slug: string;
  project: Project;
}) {
  const submittalsHint =
    project.openSubmittals > 0
      ? `${project.openSubmittals} open`
      : "None open";
  const rfisHint =
    project.openRfis > 0 ? `${project.openRfis} open` : "None open";

  const tiles = [
    {
      label: "Files",
      hint: "Drawings, specs & notes",
      href: `/projects/${slug}/files`,
      icon: Folder,
      tone: "bg-pe-green-tn text-pe-green-dk",
    },
    {
      label: "Schedule",
      hint: "3-wk look-ahead",
      href: `/projects/${slug}/schedule`,
      icon: Calendar,
      tone: "bg-blue-50 text-blue-800",
    },
    {
      label: "Submittals",
      hint: submittalsHint,
      href: `/projects/${slug}/submittals`,
      icon: FileCheck2,
      tone: "bg-violet-50 text-violet-800",
    },
    {
      label: "RFIs",
      hint: rfisHint,
      href: `/projects/${slug}/submittals`,
      icon: HelpCircle,
      tone: "bg-amber-50 text-amber-800",
    },
    {
      label: "Chat",
      hint: "Subject-threaded",
      href: `/projects/${slug}/chat`,
      icon: MessageSquare,
      tone: "bg-pink-50 text-pink-800",
    },
    {
      label: "Updates",
      hint: "Posts & OAC recaps",
      href: `/projects/${slug}/updates`,
      icon: Newspaper,
      tone: "bg-gray-100 text-pe-charcoal",
    },
  ];

  return (
    <div className="grid grid-cols-2 content-start gap-3 lg:col-span-1">
      {tiles.map(({ label, hint, href, icon: Icon, tone }) => (
        <Link
          key={label}
          href={href}
          className="card-flat group block p-4 transition-shadow hover:shadow-pop"
        >
          <div
            className={`mb-2 grid h-8 w-8 place-items-center rounded-lg ${tone}`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="text-[13px] font-semibold text-ink-900">{label}</div>
          <div className="text-[11.5px] text-ink-500">{hint}</div>
        </Link>
      ))}
    </div>
  );
}

// ---- activity feed ----------------------------------------------------------

function ActivityFeedCard({ updates }: { updates: Update[] }) {
  return (
    <article className="card-flat p-5 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink-900">
          Recent activity
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-500">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pe-green" />
          Live
        </span>
      </div>
      {updates.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">
          No recent posts yet.
        </p>
      ) : (
        <ul className="divide-y divide-black/5">
          {updates.map((update) => {
            const name = update.author || "Team";
            const gradient =
              avatarGradients[hashIndex(name, avatarGradients.length)];
            return (
              <li key={update.id} className="flex items-start gap-3 py-3">
                <div
                  className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradient} text-[11px] font-semibold text-white`}
                >
                  {initialsOf(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] leading-snug">
                    <span className="font-semibold text-ink-900">{name}</span>{" "}
                    <span className="text-ink-500">posted</span>{" "}
                    <span className="font-medium text-ink-900">
                      {update.title}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-500">
                    <span className="font-medium text-pe-green-dk">
                      {update.type}
                    </span>
                    {update.postedDate ? (
                      <>
                        <span className="mx-1.5 text-ink-300">·</span>
                        <span>{formatMonthDay(update.postedDate)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
