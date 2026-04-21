"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

/**
 * Magic-link form. Emits a POST to Supabase Auth which emails the user a
 * signed link. The link points to /auth/callback?code=... — that route
 * exchanges the code for a session cookie and redirects to `next`.
 */
export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const urlError = params.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(
    urlError
      ? { kind: "error", message: decodeURIComponent(urlError) }
      : { kind: "idle" },
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "Enter your email address." });
      return;
    }

    setStatus({ kind: "sending" });

    try {
      const supabase = createClient();
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: redirectTo,
          // Set to true to auto-create an account for unknown emails.
          // Keep false in production — we want invite-only.
          shouldCreateUser: false,
        },
      });

      if (error) {
        setStatus({ kind: "error", message: friendlyError(error.message) });
        return;
      }

      setStatus({ kind: "sent", email: trimmed });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong sending the link. Try again.",
      });
    }
  }

  if (status.kind === "sent") {
    return (
      <div
        role="status"
        className="rounded-lg bg-accent/70 border border-pe-green/20 p-4"
      >
        <p className="text-sm text-pe-charcoal font-medium">Check your inbox.</p>
        <p className="mt-1 text-sm text-pe-sub">
          We sent a sign-in link to{" "}
          <span className="font-medium text-pe-body">{status.email}</span>. It
          expires in 1 hour. You can close this tab.
        </p>
        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="mt-3 text-xs text-pe-green hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-pe-body"
        >
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={status.kind === "sending"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </div>

      {status.kind === "error" && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {status.message}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={status.kind === "sending" || !email.trim()}
      >
        {status.kind === "sending" ? "Sending link…" : "Send sign-in link"}
      </Button>

      <p className="text-xs text-pe-sub text-center">
        Don&apos;t have an account? Ask your PE contact to invite you.
      </p>
    </form>
  );
}

/**
 * Map Supabase's technical errors to something a non-technical PM can
 * actually act on.
 */
function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("signups not allowed") || lower.includes("not allowed")) {
    return "That email isn't set up yet. Ask your PE contact to invite you.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return "That doesn't look like a valid email address.";
  }
  return raw;
}
