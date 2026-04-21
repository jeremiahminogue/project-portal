import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageShell } from "@/components/pe/page-shell";
import {
  Paperclip,
  Send,
  MessageSquare,
  Pin,
  Plus,
} from "lucide-react";
import { getProject, getChatSubjects } from "@/lib/queries";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7)
    return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function ChatPage({
  params,
}: {
  params: { slug: string };
}) {
  const project = await getProject(params.slug);
  if (!project) {
    notFound();
  }

  const chatSubjects = await getChatSubjects(params.slug);
  const selectedSubject = chatSubjects[1] || chatSubjects[0];

  return (
    <PageShell className="px-0 py-0 max-w-full">
      <div className="flex h-[calc(100vh-180px)]">
        {/* Left sidebar */}
        <div className="w-80 border-r flex flex-col bg-white/50">
          <div className="px-6 py-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-pe-body">Subjects</h2>
              <Button
                disabled
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {chatSubjects.map((subject) => (
              <div
                key={subject.id}
                className={`px-4 py-3 border-l-2 cursor-pointer transition-colors ${
                  subject.id === selectedSubject.id
                    ? "bg-pe-green/10 border-pe-green"
                    : "border-transparent hover:bg-muted/40"
                }`}
              >
                <div className="font-medium text-sm text-pe-body">
                  {subject.name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {subject.description}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">
                    {subject.messageCount}
                  </span>
                  {subject.unreadCount ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-pe-green text-xs font-semibold text-white">
                      {subject.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right main area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b bg-white/50">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-pe-body">
                  {selectedSubject.name}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {selectedSubject.participants.slice(0, 3).join(", ")}
                    {selectedSubject.participants.length > 3
                      ? ` +${selectedSubject.participants.length - 3}`
                      : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {selectedSubject.messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No messages yet
                  </p>
                </div>
              </div>
            ) : (
              selectedSubject.messages.map((message) => {
                const isStaff = ["PE", "BCER", "Pueblo FD"].includes(message.role);
                return (
                  <div key={message.id}>
                    <div
                      className={`flex gap-3 ${
                        isStaff ? "flex-row-reverse" : ""
                      }`}
                    >
                      <Avatar className="h-8 w-8 shrink-0 flex-end">
                        <AvatarFallback className="text-xs">
                          {getInitials(message.author)}
                        </AvatarFallback>
                      </Avatar>

                      <div
                        className={`flex flex-col gap-1 flex-1 ${
                          isStaff ? "items-end" : "items-start"
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-semibold text-pe-body">
                            {message.author}
                          </span>
                          <span className="text-muted-foreground">
                            {message.role}
                          </span>
                          <span className="text-muted-foreground">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>

                        <div
                          className={`rounded-lg px-4 py-2 max-w-md text-sm leading-relaxed ${
                            isStaff
                              ? "bg-pe-green/10 text-pe-body"
                              : "bg-muted text-pe-body"
                          }`}
                        >
                          {message.body}
                        </div>

                        {message.attachments && (
                          <div className="flex flex-col gap-2 mt-1">
                            {message.attachments.map((att, idx) => (
                              <div
                                key={idx}
                                className="rounded border bg-white/80 px-3 py-2 text-xs text-muted-foreground"
                              >
                                <div className="font-medium text-pe-body">
                                  {att.name}
                                </div>
                                <div>{att.size}</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {message.reactions && (
                          <div className="flex gap-1 mt-1">
                            {message.reactions.map((reaction, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1 text-xs"
                              >
                                {reaction.emoji}
                                <span className="text-muted-foreground">
                                  {reaction.count}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}

                        {message.isPinned && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                            <Pin className="h-3 w-3" />
                            Pinned
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Composer */}
          <div className="border-t bg-white/50 px-6 py-4">
            <div className="flex items-end gap-3">
              <Button
                disabled
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              <Input
                disabled
                placeholder="Type a message…"
                className="rounded-full"
              />

              <Button
                disabled
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
              >
                <span className="text-xl">😊</span>
              </Button>

              <Button
                disabled
                size="sm"
                className="h-8 gap-2 bg-pe-green hover:bg-pe-green/90"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
