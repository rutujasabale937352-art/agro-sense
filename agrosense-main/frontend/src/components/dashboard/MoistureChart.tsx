import { Suspense, lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cropForZone } from "@/lib/zones";
import type { ZoneCardData } from "./ZoneCard";

const ChartBody = lazy(() => import("./MoistureChartBody"));

export function MoistureChart({ zones }: { zones: ZoneCardData[] }) {
  const readable = zones.filter((z) => z.soil_moisture !== null);
  if (!readable.length) {
    return (
      <div className="grid h-[240px] place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
        Waiting for soil moisture data
      </div>
    );
  }
  const data = readable.map((z) => ({
    name: `Z${z.zone_id} ${z.crop ?? cropForZone(z.zone_id)}`,
    moisture: z.soil_moisture as number,
  }));
  const summary = readable.map((z) => `Zone ${z.zone_id} ${z.soil_moisture} percent`).join(", ");
  return (
    <div role="img" aria-label={`Soil moisture by zone: ${summary}`}>
      <Suspense fallback={<Skeleton className="h-[240px] w-full rounded-xl" />}>
        <ChartBody data={data} />
      </Suspense>
    </div>
  );
}
