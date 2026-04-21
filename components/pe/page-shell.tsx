import { cn } from "@/lib/utils";

/** Centered, max-width page body. Used under the AppHeader. */
export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("mx-auto w-full max-w-7xl px-6 py-8", className)}>
      {children}
    </main>
  );
}
