import Link from "next/link";
import { PELogo } from "./pe-logo";
import { UserMenu } from "./user-menu";

/**
 * Global app header — thin PE-green accent band over a glass bar.
 * Sits above every page and tells you what app you're in.
 *
 * `userInitials` + `userEmail` are optional so pages that don't have a
 * session (login, callback) can still render the header shell. The avatar
 * falls back to "JM" in dev.
 */
export function AppHeader({
  userInitials = "JM",
  userEmail,
}: {
  userInitials?: string;
  userEmail?: string;
}) {
  return (
    <header className="sticky top-0 z-30">
      <div className="h-1 w-full accent-band" />
      <div className="glass-strong">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-3">
            <PELogo />
            <span className="hidden text-xs text-muted-foreground sm:inline">
              · Project Portal
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-pe-body md:flex">
            <Link href="/" className="hover:text-pe-green transition-colors">
              Projects
            </Link>
            <Link
              href="/directory"
              className="hover:text-pe-green transition-colors"
            >
              People
            </Link>
            <span className="text-muted-foreground/60">|</span>
            <Link
              href="/settings"
              className="text-muted-foreground hover:text-pe-green transition-colors"
            >
              Settings
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <UserMenu userInitials={userInitials} userEmail={userEmail} />
          </div>
        </div>
      </div>
    </header>
  );
}
