"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Folder,
  Calendar,
  FileCheck2,
  MessageSquare,
  Newspaper,
  Users,
} from "lucide-react";

const sections = [
  { label: "Home", href: "", icon: Home },
  { label: "Files", href: "/files", icon: Folder },
  { label: "Schedule", href: "/schedule", icon: Calendar },
  { label: "Submittals", href: "/submittals", icon: FileCheck2 },
  { label: "Chat", href: "/chat", icon: MessageSquare },
  { label: "Updates", href: "/updates", icon: Newspaper },
  { label: "Directory", href: "/directory", icon: Users },
] as const;

export function ProjectNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/projects/${slug}`;

  return (
    <nav
      aria-label="Project sections"
      className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-border/70 px-2"
    >
      {sections.map(({ label, href, icon: Icon }) => {
        const target = `${base}${href}`;
        const active =
          pathname === target ||
          (href !== "" && pathname.startsWith(target));
        return (
          <Link
            key={label}
            href={target}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap px-3 py-3 text-sm transition-colors border-b-2",
              active
                ? "border-pe-green text-pe-body font-medium"
                : "border-transparent text-muted-foreground hover:text-pe-body",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
