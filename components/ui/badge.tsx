import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-pe-green/15 text-pe-green-dark",
        secondary:
          "border-transparent bg-muted text-muted-foreground",
        outline: "text-foreground border-border",
        green: "border-transparent bg-pe-green/15 text-pe-green-dark",
        amber: "border-transparent bg-amber-100 text-amber-800",
        red: "border-transparent bg-rose-100 text-rose-800",
        blue: "border-transparent bg-sky-100 text-sky-800",
        gray: "border-transparent bg-zinc-100 text-zinc-700",
        purple: "border-transparent bg-violet-100 text-violet-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
