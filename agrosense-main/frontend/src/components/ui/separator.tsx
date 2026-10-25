import * as React from "react";
import { cn } from "@/lib/utils";

type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" };

function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-slate-200",
        orientation === "vertical" ? "h-6 w-px" : "h-px w-full",
        className
      )}
      {...props}
    />
  );
}

export { Separator };
