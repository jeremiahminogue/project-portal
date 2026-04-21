import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { PELogo } from "@/components/pe/pe-logo";

/**
 * /login — magic-link sign-in page.
 *
 * Server wrapper: renders chrome + suspense boundary. The form is a
 * client component (needs state + the browser Supabase client).
 *
 * URL params:
 *   ?next=/projects/...   — where to redirect after successful sign-in
 *                            (preserved from middleware bounce)
 *   ?error=...            — rendered as a banner if the callback route
 *                            bounces back with a failure
 */
export default function LoginPage() {
  return (
    <main className="min-h-screen surface-subtle flex flex-col">
      <div className="accent-band h-1 w-full" />

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <PELogo />
          </div>

          <div className="glass-strong rounded-2xl p-8">
            <h1 className="text-2xl font-semibold text-pe-charcoal tracking-tight">
              Sign in
            </h1>
            <p className="mt-2 text-sm text-pe-sub">
              Enter your email and we&apos;ll send a secure sign-in link.
            </p>

            <div className="mt-6">
              <Suspense fallback={<FormSkeleton />}>
                <LoginForm />
              </Suspense>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-pe-sub">
            Pueblo Electric Project Portal
          </p>
        </div>
      </div>
    </main>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-10 rounded-md bg-muted/60 animate-pulse" />
      <div className="h-10 rounded-md bg-muted/60 animate-pulse" />
    </div>
  );
}
