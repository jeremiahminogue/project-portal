import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/pe/page-shell";
import { Heart, MessageCircle, Share2, Plus } from "lucide-react";
import { getProject, getUpdates } from "@/lib/queries";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function getTypeColor(
  type: "OAC Recap" | "Phase Kickoff" | "Safety" | "Weekly"
) {
  switch (type) {
    case "OAC Recap":
      return "blue";
    case "Weekly":
      return "green";
    case "Phase Kickoff":
      return "purple";
    case "Safety":
      return "amber";
    default:
      return "gray";
  }
}

export default async function UpdatesPage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProject(params.slug);
  if (!project) {
    notFound();
  }

  const updates = await getUpdates(params.slug);
  const sortedUpdates = [...updates].sort(
    (a, b) =>
      new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime()
  );

  return (
    <PageShell>
      <div className="mb-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-pe-body">Updates</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              PM-authored posts · safety, weekly, OAC recaps
            </p>
          </div>
          <Button disabled variant="secondary">
            <Plus className="mr-2 h-4 w-4" />
            New Update
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {sortedUpdates.map((update) => (
          <Card key={update.id} className="p-6 hover:shadow-md transition-shadow">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-4 flex-1">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="text-sm">
                    {getInitials(update.author)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant={getTypeColor(update.type)}
                      className="w-fit text-xs"
                    >
                      {update.type}
                    </Badge>
                  </div>
                  <h3 className="text-base font-semibold text-pe-body mb-1">
                    {update.title}
                  </h3>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-pe-body">
                      {update.author}
                    </span>
                    {" · "}
                    <span>
                      {update.postedDate} at {update.postedTime}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="mb-4 text-sm text-pe-body leading-relaxed prose prose-sm max-w-none">
              {update.body.split("\n\n").map((paragraph, idx) => (
                <p key={idx} className="mb-3 last:mb-0">
                  {paragraph}
                </p>
              ))}
            </div>

            {/* Attachments */}
            {update.attachments && update.attachments.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {update.attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">{att.name}</span>
                    <span>({att.size})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-4 pt-4 border-t">
              <Button
                disabled
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-pe-body"
              >
                <Heart className="mr-1.5 h-4 w-4" />
                <span className="text-xs">{update.likes}</span>
              </Button>

              <Button
                disabled
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-pe-body"
              >
                <MessageCircle className="mr-1.5 h-4 w-4" />
                <span className="text-xs">
                  {update.commentCount > 0
                    ? `${update.commentCount} comment${update.commentCount !== 1 ? "s" : ""}`
                    : "Comment"}
                </span>
              </Button>

              <Button
                disabled
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-pe-body ml-auto"
              >
                <Share2 className="mr-1.5 h-4 w-4" />
                <span className="text-xs">Share</span>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
