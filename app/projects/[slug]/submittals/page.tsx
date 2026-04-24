import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/pe/page-shell";
import { PageKicker } from "@/components/pe/page-kicker";
import { StatusChip } from "@/components/pe/status-chip";
import { getProject, getSubmittals, getRfis } from "@/lib/queries";

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function RoutingStepper({ routing }: { routing: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {routing.map((step, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
              idx === 1
                ? "bg-pe-green text-white"
                : idx < 1
                  ? "bg-pe-green text-white"
                  : "bg-gray-200 text-gray-600"
            }`}
          >
            {idx < 1 ? "✓" : idx === 1 ? "•" : idx + 1}
          </div>
          {idx < routing.length - 1 && (
            <div
              className={`h-0.5 w-12 ${
                idx < 0 ? "bg-pe-green" : "bg-gray-300"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default async function SubmittalsPage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProject(params.slug);
  if (!project) {
    notFound();
  }

  const [submittals, rfis] = await Promise.all([
    getSubmittals(params.slug),
    getRfis(params.slug),
  ]);

  // In live mode the second submittal's routing is empty — use it if present
  // (mock mode), otherwise fall back to the standard 4-step PE routing chain.
  const detailSubmittal = submittals[1] ?? submittals[0];
  const detailRouting =
    detailSubmittal && detailSubmittal.routing.length > 0
      ? detailSubmittal.routing
      : ["PE", "Owner's Rep", "Designer", "Owner"];

  return (
    <PageShell>
      <div className="mb-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <PageKicker>{project.title}</PageKicker>
            <h1 className="mt-1 text-3xl font-bold text-pe-body">
              Submittals & RFIs
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {submittals.length} submittals · {rfis.length} RFIs
            </p>
          </div>
          <div className="flex gap-2">
            <Button disabled variant="secondary">
              New Submittal
            </Button>
            <Button disabled variant="secondary">
              New RFI
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="submittals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="submittals">
            Submittals ({submittals.length})
          </TabsTrigger>
          <TabsTrigger value="rfis">RFIs ({rfis.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="submittals">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      #
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Title
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Spec §
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Submitted
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Due
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Owner
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {submittals.map((sub, idx) => (
                    <tr
                      key={idx}
                      className="border-b hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-pe-body">
                        {sub.number}
                      </td>
                      <td className="px-4 py-3 text-pe-body">{sub.title}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {sub.specSection}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(sub.submittedDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(sub.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-pe-body">{sub.owner}</td>
                      <td className="px-4 py-3">
                        <StatusChip label={sub.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Detail card for the active submittal */}
          {detailSubmittal && (
            <Card className="mt-6 p-6">
              <h3 className="text-base font-semibold text-pe-body mb-4">
                Detail: {detailSubmittal.number} {detailSubmittal.title}
              </h3>

              <div className="mb-6 py-4">
                <RoutingStepper routing={detailRouting} />
              </div>

              <div className="mb-6 flex flex-wrap gap-3">
                <Badge variant="outline">
                  Submitted: {formatDate(detailSubmittal.submittedDate)}
                </Badge>
                <Badge variant="outline">
                  Due: {formatDate(detailSubmittal.dueDate)}
                </Badge>
                {detailSubmittal.owner && (
                  <Badge variant="outline">Owner: {detailSubmittal.owner}</Badge>
                )}
                <StatusChip label={detailSubmittal.status} />
              </div>

              <div className="flex gap-2">
                <Button disabled variant="secondary">
                  Approve
                </Button>
                <Button disabled variant="secondary">
                  R&R
                </Button>
                <Button disabled variant="destructive">
                  Reject
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rfis">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      #
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Question
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Opened
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Due
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Assigned To
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Org
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-pe-body">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rfis.map((rfi, idx) => (
                    <tr
                      key={idx}
                      className="border-b hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-pe-body">
                        {rfi.number}
                      </td>
                      <td className="px-4 py-3 text-pe-body line-clamp-1">
                        {rfi.question}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(rfi.openedDate)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(rfi.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-pe-body">
                        {rfi.assignedTo}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {rfi.assignedOrg}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip label={rfi.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
