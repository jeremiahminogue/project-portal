/**
 * Small uppercase project-name label shown above a sub-page's H1.
 *
 * The per-project layout only renders the tab nav (no big hero), so sub-pages
 * use this kicker to preserve the "I'm inside project X" context at a glance.
 * Matches the `text-[11px] uppercase tracking-wider` kicker pattern used
 * throughout the design mockup.
 */
export function PageKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
      {children}
    </div>
  );
}
