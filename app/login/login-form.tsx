"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Eye,
  EyeOff,
  Mail,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "signup-sent"; email: string }
  | { kind: "error"; message: string };

/**
 * Email + password auth form. Supports both sign-in and sign-up via a
 * top-of-card pill toggle.
 *
 * Flow:
 *   - Sign in: signInWithPassword() → session cookie set on success →
 *     router.refresh() (so server components re-render with session) →
 *     push to `next`.
 *   - Sign up: signUp() → if the Supabase project has "confirm email"
 *     DISABLED, a session is returned immediately and we send them in.
 *     If confirmation is enabled, we land in the "check your email" state.
 *
 * Motion notes:
 *   - Tab switch uses `animate-in fade-in` (no layout thrash).
 *   - Button press: `active:scale-[0.98]`, 75ms transition — reads as a
 *     physical press rather than a staged animation.
 *   - Error banner slides in from the top — cheap but signals "this is new".
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const urlError = params.get("error");

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState<Status>(
    urlError
      ? { kind: "error", message: decodeURIComponent(urlError) }
      : { kind: "idle" },
  );

  const isSubmitting = status.kind === "submitting";
  const isError = status.kind === "error";

  function clearErrorOnChange() {
    if (isError) setStatus({ kind: "idle" });
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setStatus({ kind: "idle" });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const emailTrimmed = email.trim();

    if (!emailTrimmed) {
      setStatus({ kind: "error", message: "Enter your email address." });
      return;
    }
    if (!password) {
      setStatus({ kind: "error", message: "Enter your password." });
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setStatus({
        kind: "error",
        message: "Password must be at least 8 characters.",
      });
      return;
    }

    setStatus({ kind: "submitting" });

    try {
      const supabase = createClient();

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });

        if (error) {
          setStatus({
            kind: "error",
            message: friendlyError(error.message, mode),
          });
          return;
        }

        // Session cookie is now set; ensure server components re-render.
        router.refresh();
        router.push(next);
        return;
      }

      // Sign-up branch
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

      const { data, error } = await supabase.auth.signUp({
        email: emailTrimmed,
        password,
        options: {
          emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(
            next,
          )}`,
        },
      });

      if (error) {
        setStatus({
          kind: "error",
          message: friendlyError(error.message, mode),
        });
        return;
      }

      // If email confirmation is DISABLED in the Supabase project, signUp
      // returns a session and we can go straight in. Otherwise data.session
      // is null and the user has to click the confirmation email.
      if (data.session) {
        router.refresh();
        router.push(next);
        return;
      }

      setStatus({ kind: "signup-sent", email: emailTrimmed });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Something went wrong. Try again.",
      });
    }
  }

  // -----------------------------------------------------------------------
  // Signup-email-sent confirmation state
  // -----------------------------------------------------------------------
  if (status.kind === "signup-sent") {
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
              Confirm your email
            </p>
            <p className="mt-1 text-sm text-pe-sub">
              We sent a confirmation link to{" "}
              <span className="font-medium text-pe-body">{status.email}</span>.
              Click it to activate your account, then come back and sign in.
            </p>
            <button
              type="button"
              onClick={() => {
                setPassword("");
                setMode("signin");
                setStatus({ kind: "idle" });
              }}
              className="mt-3 text-xs text-pe-green hover:text-pe-green-dark hover:underline underline-offset-2 transition-colors"
            >
              Back to sign in →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Primary form
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div
        role="tablist"
        aria-label="Sign in or sign up"
        className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1"
      >
        <ModeTab
          label="Sign in"
          active={mode === "signin"}
          onClick={() => switchMode("signin")}
        />
        <ModeTab
          label="Sign up"
          active={mode === "signup"}
          onClick={() => switchMode("signup")}
        />
      </div>

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
            disabled={isSubmitting}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearErrorOnChange();
            }}
            placeholder="you@company.com"
            className="transition-all duration-200 focus-visible:shadow-sm focus-visible:shadow-pe-green/10"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-pe-body"
          >
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              required
              disabled={isSubmitting}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearErrorOnChange();
              }}
              placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
              className="pr-10 transition-all duration-200 focus-visible:shadow-sm focus-visible:shadow-pe-green/10"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-pe-sub hover:text-pe-body transition-colors"
            >
              {showPw ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
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
          disabled={isSubmitting || !email.trim() || !password}
        >
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2 animate-in fade-in duration-200">
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === "signin" ? "Signing in…" : "Creating account…"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 animate-in fade-in duration-200">
              {mode === "signin" ? "Sign in" : "Create account"}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
            </span>
          )}
        </Button>

        <p className="text-xs text-pe-sub text-center">
          {mode === "signin"
            ? "New here? Switch to Sign up above."
            : "Already have an account? Switch to Sign in above."}
        </p>
      </form>
    </div>
  );
}

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
        active
          ? "bg-white text-pe-charcoal shadow-sm"
          : "text-pe-sub hover:text-pe-body",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Map Supabase's technical errors to something a non-technical user can act on.
 */
function friendlyError(raw: string, mode: Mode): string {
  const lower = raw.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "Email or password doesn't match. Try again.";
  }
  if (lower.includes("email not confirmed")) {
    return "You haven't confirmed your email yet. Check your inbox for the confirmation link.";
  }
  if (lower.includes("user already registered")) {
    return "That email already has an account. Switch to Sign in.";
  }
  if (lower.includes("signups not allowed") || lower.includes("signup is disabled")) {
    return "Sign-ups are currently disabled. Ask your PE contact to invite you.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (lower.includes("password should be") || lower.includes("weak password")) {
    return "Password is too weak. Use at least 8 characters with a mix of letters and numbers.";
  }
  if (lower.includes("invalid") && lower.includes("email")) {
    return "That doesn't look like a valid email address.";
  }

  // Default: fall back to the raw message but capitalize the first letter.
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
