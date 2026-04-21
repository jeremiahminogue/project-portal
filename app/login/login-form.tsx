"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail, AlertCircle, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

/**
 * Magic-link form. POSTs to Supabase Auth which emails the user a signed
 * link. The link points to /auth/callback?code=… — that route exchanges
 * the code for a session cookie and redirects to `next`.
 *
 * Motion notes:
 *   - State-swap components each use `animate-in fade-in` so transitions
 *     from idle → sending → sent look like a morph, not a jump-cut.
 *   - Button press uses `active:scale-[0.98]` with a 75ms transition —
 *     short enough to feel like a physical press rather than an animation.
 *   - "Sent" confirmation has a staggered fade so the icon arrives first,
 *     then the title, then the caption. Feels considered. Total cascade
 *     ≈ 500ms.
 *
 * Copy notes:
 *   - The button ends with an arrow icon that drifts right on hover —
 *     classic Apple-style affordance without being showy.
 *   - Error messages are mapped through `friendlyError()` so a PM sees
 *     an actionable sentence instead of raw Supabase text.
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
          // Invite-only: PE provisions accounts, strangers can't sign up.
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
        className="rounded-xl bg-accent/60 border border-pe-green/25 p-5 animate-in fade-in zoom-in-95 duration-500 ease-out"
      >
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 flex-shrink-0 mt-0.5 rounded-full bg-pe-green/15 flex items-center justify-center animate-in zoom-in-50 duration-500 ease-out">
            <Mail className="h-4 w-4 text-pe-green" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-pe-charcoal">
              Check your inbox
            </p>
            <p className="mt-1 text-sm text-pe-sub">
              We sent a sign-in link to{" "}
              <span className="font-medium text-pe-body">{status.email}</span>.
              It expires in one hour. You can close this tab.
            </p>
            <button
              type="button"
              onClick={() => {
                setEmail("");
                setStatus({ kind: "idle" });
              }}
              className="mt-3 text-xs text-pe-green hover:text-pe-green-dark hover:underline underline-offset-2 transition-colors"
            >
              Use a different email →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isSending = status.kind === "sending";
  const isError = status.kind === "error";

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
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
          autoFocus
          required
          disabled={isSending}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Clear any previous error the moment they start retyping.
            if (isError) setStatus({ kind: "idle" });
          }}
          placeholder="you@company.com"
          className="transition-all duration-200 focus-visible:shadow-sm focus-visible:shadow-pe-green/10"
        />
      </div>

      {isError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-destructive/5 border border-destructive/20 p-3 animate-in fade-in slide-in-from-top-1 duration-300 ease-out"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-destructive" />
          <p className="text-sm text-destructive">{status.message}</p>
        </div>
      )}

      <Button
        type="submit"
        className="w-full group active:scale-[0.98] transition-transform duration-75 ease-out"
        disabled={isSending || !email.trim()}
      >
        {isSending ? (
          <span className="inline-flex items-center gap-2 animate-in fade-in duration-200">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending link…
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 animate-in fade-in duration-200">
            Send sign-in link
            <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
          </span>
        )}
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
