import Link from "next/link";
import { Users, Shield } from "lucide-react";
import { AppHeader } from "@/components/pe/app-header";
import { requireSuperadmin, initialsFor } from "@/lib/auth/user";

/**
 * Admin shell.
 *
 * The superadmin gate runs here so every nested page / layout inherits it.
 * `requireSuperadmin()` redirects to `/` when the caller is logged in but
 * not a superadmin. Middleware bounces anonymous traffic before we get here.
 *
 * We intentionally don't show any "admin" chrome on non-admin pages — the
 * admin surface is a dedicated subtree under /admin, which keeps the
 * mental model simple.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireSuperadmin();
  const userInitials = initialsFor(profile, user.email ?? null);

  return (
    <>
      <AppHeader
        userInitials={userInitials}
        userEmail={user.email ?? undefined}
        isSuperadmin
      />
      <div className="border-b border-border/70 bg-white/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-6">
          <AdminTab href="/admin/users" label="Users" icon={Users} />
          <AdminBadge />
        </div>
      </div>
      {children}
    </>
  );
}

/**
 * Small nav tab. We rely on server-side `usePathname` alternatives later;
 * for now the admin surface only has a single top-level section ("Users"),
 * so the `active` styling is hard-coded. When we add more tabs (Projects,
 * Audit log, …) we'll move this to a client component with `usePathname`.
 */
function AdminTab({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 whitespace-nowrap border-b-2 border-pe-green px-3 py-3 text-sm font-medium text-pe-body transition-colors"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function AdminBadge() {
  return (
    <div className="ml-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
      <Shield className="h-3.5 w-3.5 text-pe-green" />
      <span>Admin console</span>
    </div>
  );
}
