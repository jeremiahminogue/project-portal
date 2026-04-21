import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/pe/page-shell";
import { UserPlus, Mail } from "lucide-react";
import { getProject, getDirectory } from "@/lib/queries";
import type { DirectoryEntry } from "@/data/types";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function getStatusColor(
  status: "Admin" | "Member" | "Guest-Admin" | "Guest" | "Reviewer" | "Owner" | "AHJ"
) {
  switch (status) {
    case "Admin":
      return "green";
    case "Owner":
      return "blue";
    case "Member":
      return "blue";
    case "Reviewer":
      return "purple";
    case "Guest-Admin":
      return "purple";
    case "Guest":
      return "amber";
    case "AHJ":
      return "red";
    default:
      return "gray";
  }
}

export default async function DirectoryPage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProject(params.slug);
  if (!project) {
    notFound();
  }

  const directory = await getDirectory(params.slug);

  // Group by organization
  const grouped = directory.reduce(
    (acc, entry) => {
      if (!acc[entry.organization]) {
        acc[entry.organization] = [];
      }
      acc[entry.organization].push(entry);
      return acc;
    },
    {} as Record<string, DirectoryEntry[]>
  );

  const orgs = Object.keys(grouped).sort();
  const uniqueOrgs = new Set(directory.map((d) => d.organization));

  return (
    <PageShell>
      <div className="mb-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-pe-body">People</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {directory.length} people · {uniqueOrgs.size} organizations
            </p>
          </div>
          <Button disabled variant="secondary">
            <UserPlus className="mr-2 h-4 w-4" />
            Invite
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        {orgs.map((org) => (
          <div key={org}>
            <h2 className="text-base font-semibold text-pe-body mb-4">
              {org}
            </h2>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {grouped[org].map((person) => (
                <Card
                  key={person.id}
                  className="p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="text-sm font-semibold">
                        {getInitials(person.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <div className="font-semibold text-sm text-pe-body">
                        {person.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {person.role}
                      </div>
                    </div>
                  </div>

                  <Badge
                    variant={getStatusColor(person.status)}
                    className="mb-3 w-fit text-xs"
                  >
                    {person.status}
                  </Badge>

                  {person.email && (
                    <a
                      href={`mailto:${person.email}`}
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-pe-body transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{person.email}</span>
                    </a>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
