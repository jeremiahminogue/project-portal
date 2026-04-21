import "server-only";
import type { ChatSubject, ChatMessage } from "@/data/types";
import { chatSubjects as mockChat } from "@/data/chat";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK } from "./_config";
import { getProjectId } from "./projects";

type AuthorProfile = {
  full_name: string | null;
  email: string;
  company: string | null;
} | null;

interface ChatMessageRow {
  id: string;
  body: string;
  created_at: string;
  profiles: AuthorProfile | AuthorProfile[];
}

interface ChatSubjectRow {
  id: string;
  title: string;
  last_message_at: string | null;
  chat_messages: ChatMessageRow[] | null;
}

/** First + last initial from a full name, falling back to "?". */
function initialsOf(fullName: string | null | undefined, email: string): string {
  const source = fullName?.trim() || email.split("@")[0];
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * List chat subjects for a project, each hydrated with its messages and
 * author profiles.
 *
 * One round-trip: Supabase's nested select pulls `chat_messages` and each
 * message's `profiles` row at once. We sort messages client-side by
 * `created_at` ascending (PostgREST can't order a nested relation reliably
 * through the JS client yet). Subjects come back newest-first by
 * `last_message_at`.
 *
 * Unmapped today: `description` (no DB column — emits empty string),
 * `unreadCount`, `attachments`, `reactions`, `isPinned`. Those need follow-up
 * tables/columns; the UI already renders with them absent.
 */
export async function getChatSubjects(slug: string): Promise<ChatSubject[]> {
  if (USE_MOCK) return mockChat;

  const supabase = createClient();
  const projectId = await getProjectId(slug);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("chat_subjects")
    .select(
      `
      id,
      title,
      last_message_at,
      chat_messages (
        id,
        body,
        created_at,
        profiles:author_id (
          full_name,
          email,
          company
        )
      )
    `,
    )
    .eq("project_id", projectId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(`getChatSubjects failed: ${error.message}`);

  const rows = (data ?? []) as unknown as ChatSubjectRow[];

  return rows.map((row): ChatSubject => {
    const rawMessages = row.chat_messages ?? [];

    const messages: ChatMessage[] = rawMessages
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m): ChatMessage => {
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return {
          id: m.id,
          author: profile ? (profile.full_name ?? profile.email) : "",
          role: profile?.company ?? "",
          body: m.body,
          timestamp: m.created_at,
        };
      });

    // Derive participant initials from distinct authors.
    const seen = new Set<string>();
    const participants: string[] = [];
    for (const m of rawMessages) {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      if (!profile) continue;
      const key = profile.full_name ?? profile.email;
      if (seen.has(key)) continue;
      seen.add(key);
      participants.push(initialsOf(profile.full_name, profile.email));
    }

    return {
      id: row.id,
      name: row.title,
      description: "",
      messageCount: rawMessages.length,
      messages,
      participants,
    };
  });
}
