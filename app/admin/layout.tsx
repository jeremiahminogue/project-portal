import { Shield } from "lucide-react";
import { AppHeader } from "@/components/pe/app-header";
import { requireSuperadmin, initialsFor } from "@/lib/auth/user";
import { AdminTabs } from "./admin-tabs";

/**
 * Admin shell.
 *
 * The superadmin gate runs here so every nested page / layout inherits it.
 * `requireSuperadmin()` redirects to `/` when the caller is logged in but
 * not a superadmin. Middleware bounces anonymous traffic before we get here.
 *
 * Tab rendering is delegated to `<AdminTabs />` (client component) so
 * `usePathname` can drive the active-state styling. Keeps the layout itself
 * a server component so the auth gate stays on the server.
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
          <AdminTabs />
          <AdminBadge />
        </div>
      </div>
      {children}
    </>
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
