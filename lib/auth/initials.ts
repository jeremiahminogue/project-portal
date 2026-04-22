/**
 * # Client-safe auth helpers
 *
 * `lib/auth/user.ts` is marked `import "server-only"` because it calls
 * Supabase from the server. But a few pure helpers in that module — most
 * notably `initialsFor` — are useful from client components too (avatars
 * in admin tables, etc.).
 *
 * This file exists so client components can import those pure helpers
 * without dragging the whole server-only module into the client bundle.
 *
 * Rule: nothing in this file may import `server-only`, Supabase server
 * helpers, `next/navigation`'s `redirect`, or anything else that only
 * runs on the server. If you need a new helper that touches the server,
 * put it in `user.ts`, not here.
 */

/**
 * Narrow shape the initials helper needs. We redeclare it here (rather
 * than importing `ProfileRow` from `user.ts`) so this file stays truly
 * client-safe — importing a type from a `server-only` file is fine at
 * build time, but keeping this self-contained makes the boundary easier
 * to reason about.
 */
export interface HasFullName {
  full_name: string | null;
}

/**
 * Compute 1–2 character initials from a profile + email. Stable so the
 * avatar doesn't flicker between renders.
 *
 *   "Jeremiah Minogue"  → "JM"
 *   "Jeremiah"          → "JE"   (first two letters of the single name)
 *   null + "j@pe.com"   → "J"    (first letter of the email local-part)
 *   null + null         → "?"
 */
export function initialsFor(
  profile: HasFullName | null,
  email: string | null,
): string {
  const name = profile?.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    }
    if (parts.length === 1 && parts[0]!.length >= 2) {
      return parts[0]!.slice(0, 2).toUpperCase();
    }
    if (parts.length === 1) {
      return parts[0]![0]!.toUpperCase();
    }
  }
  const local = email?.split("@")[0]?.trim();
  if (local && local.length > 0) {
    return local[0]!.toUpperCase();
  }
  return "?";
}
