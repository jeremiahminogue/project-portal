import { cn } from "@/lib/utils";
import * as React from "react";

/** Rounded glass panel. Pairs nicely with surface-subtle backgrounds. */
export function GlassCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "glass rounded-lg p-5 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
