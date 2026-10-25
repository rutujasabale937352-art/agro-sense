import { Suspense, lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ZoneTelemetry } from "@/types";

const DonutBody = lazy(() => import("./PumpDonutBody"));

export function PumpDonut({ zones }: { zones: ZoneTelemetry[] }) {
  const on = zones.filter((z) => z.pump_status).length;
  const off = Math.max(zones.length - on, 0);
  if (!zones.length) {
    return <div className="grid h-[190px] place-items-center text-sm text-slate-400">No pump data</div>;
  }
  return (
    <div>
      <Suspense fallback={<Skeleton className="mx-auto h-[150px] w-[150px] rounded-full" />}>
        <DonutBody on={on} off={off} />
      </Suspense>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden /> ON ({on})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" aria-hidden /> OFF ({off})
        </span>
      </div>
    </div>
  );
}
