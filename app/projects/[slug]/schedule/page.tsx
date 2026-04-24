import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/pe/page-shell';
import { PageKicker } from '@/components/pe/page-kicker';
import { getProject, getSchedule } from '@/lib/queries';
import { Copy } from 'lucide-react';

// Timeline helpers
const START = new Date('2026-04-19'); // Sunday
const weekIndex = (iso: string): number => {
  const d = new Date(iso);
  const weeks = Math.floor((d.getTime() - START.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, weeks + 1);
};

const weekSpan = (startIso: string, endIso: string): number => {
  return Math.max(1, weekIndex(endIso) - weekIndex(startIso) + 1);
};

// Color mapping for activity types
const typeToColor: Record<string, string> = {
  design: 'bg-slate-500',
  bcer: 'bg-purple-500',
  ahj: 'bg-blue-500',
  field: 'bg-amber-500',
  milestone: 'bg-red-500',
  internal: 'bg-zinc-500',
};

// Phase order
const phaseOrder = [
  'Events Center',
  'Palace of Ag',
  'Maintenance',
  'Creative Arts',
  'Coors Pavilion',
];

export default async function SchedulePage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProject(params.slug);

  if (!project) {
    notFound();
  }

  const scheduleActivities = await getSchedule(params.slug);
  const todayIndex = weekIndex('2026-04-21');
  const nonBlackoutActivities = scheduleActivities.filter((a) => !a.isBlackout);
  const blackoutActivities = scheduleActivities.filter((a) => a.isBlackout);

  // Generate 26 weeks of headers
  const weeks = Array.from({ length: 26 }, (_, i) => {
    const date = new Date(START);
    date.setDate(date.getDate() + i * 7);
    return date;
  });

  // Month labels every 4 weeks
  const monthLabels = weeks.map((d, i) => {
    if (i % 4 === 0) {
      return d.toLocaleDateString('en-US', { month: 'short' });
    }
    return null;
  });

  return (
    <PageShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <PageKicker>{project.title}</PageKicker>
              <h1 className="mt-1 text-2xl font-bold text-pe-body">
                Master Schedule
              </h1>
              <p className="text-sm text-muted-foreground">
                6-month window · drag to pan (coming soon)
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" size="sm" disabled className="gap-2">
                <Copy className="h-4 w-4" />
                Paste from MSP
              </Button>
              <Badge variant="secondary" className="h-fit">
                Today: April 21
              </Badge>
            </div>
          </div>
        </div>

        {/* Timeline Grid */}
        <Card className="overflow-x-auto">
          <div
            className="inline-block min-w-full"
            style={{
              display: 'grid',
              gridTemplateColumns: `minmax(140px, auto) repeat(26, minmax(0, 1fr))`,
              gap: '0',
            }}
          >
            {/* Header Row */}
            <div className="border-r border-b border-border bg-muted/50 sticky left-0 z-10 p-3 text-xs font-medium text-muted-foreground" />
            {weeks.map((week, idx) => (
              <div
                key={idx}
                className="border-r border-b border-border bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground h-12 flex items-center justify-center"
              >
                {monthLabels[idx]}
              </div>
            ))}

            {/* Today line and blackout shading */}
            {phaseOrder.map((phaseName) => {
              const phaseActivities = nonBlackoutActivities.filter(
                (a) => a.phase === phaseName
              );
              const phaseBlackouts = blackoutActivities.filter(
                (a) => a.phase === phaseName
              );

              return (
                <div key={phaseName} className="contents">
                  {/* Phase label */}
                  <div className="border-r border-b border-border bg-white p-3 text-sm font-medium text-pe-body sticky left-0 z-10">
                    {phaseName}
                  </div>

                  {/* Week cells */}
                  {weeks.map((_, weekIdx) => {
                    const cellKey = `${phaseName}-${weekIdx}`;
                    const isTodayColumn = weekIdx + 1 === todayIndex;
                    const blackout = phaseBlackouts.find(
                      (b) =>
                        weekIndex(b.startDate) <= weekIdx + 1 &&
                        weekIndex(b.endDate) >= weekIdx + 1
                    );

                    return (
                      <div
                        key={cellKey}
                        className={`relative border-r border-b border-border p-1 h-16 ${
                          isTodayColumn ? 'bg-pe-green/5' : ''
                        } ${blackout ? (blackout.status === 'red' ? 'bg-rose-100' : 'bg-zinc-100') : ''}`}
                      >
                        {isTodayColumn && (
                          <div className="absolute left-1/2 top-0 -ml-px h-full w-0.5 bg-pe-green" />
                        )}
                      </div>
                    );
                  })}

                  {/* Activity bars */}
                  {phaseActivities.map((activity) => {
                    const start = weekIndex(activity.startDate);
                    const span = weekSpan(activity.startDate, activity.endDate);
                    const bgColor = typeToColor[activity.type];

                    return (
                      <div
                        key={activity.id}
                        className="contents"
                        style={{
                          gridColumn: `2 / span ${26}`,
                        }}
                      >
                        <div
                          className={`col-start-[${start + 1}] row-start-auto ${bgColor} text-white text-xs font-medium rounded px-2 py-1 truncate shadow-sm hover:shadow-md transition-shadow`}
                          style={{
                            gridColumn: `${start + 1} / span ${span}`,
                          }}
                          title={`${activity.title}: ${activity.startDate} - ${activity.endDate}`}
                        >
                          {activity.title}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Today label */}
          <div className="relative h-6 bg-white border-t border-border">
            <div
              className="absolute top-0 -ml-px w-0.5 h-full bg-pe-green"
              style={{
                left: `calc(140px + ${(todayIndex - 1) * (100 / 26)}%)`,
              }}
            >
              <span className="absolute top-1 left-0 ml-1 text-xs font-medium text-pe-green-dark whitespace-nowrap">
                Today
              </span>
            </div>
          </div>
        </Card>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Object.entries(typeToColor).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded ${color}`} />
              <span className="text-xs text-pe-body capitalize">{type}</span>
            </div>
          ))}
        </div>

        {/* Details Table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-4 text-left font-medium text-pe-body">Phase</th>
                  <th className="p-4 text-left font-medium text-pe-body">Title</th>
                  <th className="p-4 text-left font-medium text-pe-body">Start</th>
                  <th className="p-4 text-left font-medium text-pe-body">End</th>
                  <th className="p-4 text-left font-medium text-pe-body">Owner</th>
                  <th className="p-4 text-left font-medium text-pe-body">Status</th>
                </tr>
              </thead>
              <tbody>
                {nonBlackoutActivities.map((activity) => (
                  <tr key={activity.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="p-4 text-muted-foreground">{activity.phase}</td>
                    <td className="p-4 font-medium text-pe-body">{activity.title}</td>
                    <td className="p-4 text-muted-foreground">
                      {new Date(activity.startDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {new Date(activity.endDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="p-4 text-muted-foreground">{activity.owner}</td>
                    <td className="p-4">
                      <Badge variant={activity.status}>{activity.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
