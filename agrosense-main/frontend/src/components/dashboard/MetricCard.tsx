import { memo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const TONES: Record<string, { icon: string; text: string }> = {
  red: { icon: "bg-red-50 text-red-500", text: "" },
  blue: { icon: "bg-blue-50 text-blue-500", text: "" },
  cyan: { icon: "bg-cyan-50 text-cyan-600", text: "" },
  slate: { icon: "bg-slate-100 text-slate-500", text: "" },
  purple: { icon: "bg-violet-50 text-violet-500", text: "" },
  green: { icon: "bg-emerald-50 text-emerald-600", text: "" },
  amber: { icon: "bg-amber-50 text-amber-600", text: "" },
};

export const MetricCard = memo(function MetricCard({
  icon: Icon,
  label,
  value,
  sub = "Live reading",
  tone = "green",
  alert,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof TONES | string;
  alert?: boolean;
}) {
  const t = TONES[tone] ?? TONES.green;
  return (
    <Card
      className={cn(
        "p-4 transition-shadow hover:shadow-md",
        alert && "border-amber-300 ring-1 ring-amber-200"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", t.icon)}>
          <Icon size={22} strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-slate-500">{label}</div>
          <div className="truncate text-[22px] font-bold tracking-tight text-slate-900">{value}</div>
          <div className="text-[10px] text-slate-400">{sub}</div>
        </div>
      </div>
    </Card>
  );
});
