"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder, Users } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The nav strip for the admin subtree. Client component so we can use
 * `usePathname()` to highlight the active tab without pushing a bunch of
 * prop plumbing through the server layout.
 *
 * Active logic: exact match OR starts-with for nested routes. That way
 * `/admin/users/abc123` still lights up the "Users" tab.
 */
export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      <AdminTab
        href="/admin/users"
        label="Users"
        icon={Users}
        active={isActive(pathname, "/admin/users")}
      />
      <AdminTab
        href="/admin/projects"
        label="Projects"
        icon={Folder}
        active={isActive(pathname, "/admin/projects")}
      />
    </div>
  );
}

function isActive(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function AdminTab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
        active
          ? "border-pe-green text-pe-body"
          : "border-transparent text-muted-foreground hover:border-pe-green/40 hover:text-pe-body",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
