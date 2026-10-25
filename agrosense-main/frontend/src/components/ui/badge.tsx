import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none transition-colors",
  {
    variants: {
      variant: {
        default: "bg-emerald-600 text-white",
        secondary: "bg-emerald-100 text-emerald-800",
        outline: "border border-slate-200 bg-white text-slate-600",
        destructive: "bg-red-100 text-red-700",
        warning: "bg-amber-100 text-amber-800",
        info: "bg-sky-100 text-sky-800",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
