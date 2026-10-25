import { memo } from "react";
import { Sprout } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { cropForZone } from "@/lib/zones";

export type ZoneCardData = {
  zone_id: number;
  crop?: string;
  soil_moisture: number | null;
  pump_status: boolean;
  moisture_min?: number;
  moisture_max?: number;
};

export const ZoneCard = memo(function ZoneCard({ zone }: { zone: ZoneCardData }) {
  const crop = zone.crop ?? cropForZone(zone.zone_id);
  const min = zone.moisture_min ?? 30;
  const max = zone.moisture_max ?? 70;
  const moisture = zone.soil_moisture;
  const state =
    moisture === null ? "unknown" : moisture < min ? "dry" : moisture > max ? "saturated" : "healthy";
  const label =
    state === "unknown"
      ? "No data"
      : state === "dry"
        ? "Needs water"
        : state === "saturated"
          ? "Saturated"
          : "Healthy";
  return (
    <Card className="flex min-h-[186px] flex-col p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
          <Sprout size={20} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-slate-800">Zone {zone.zone_id}</div>
          <div className="text-[11px] text-slate-500">{crop}</div>
        </div>
        <Badge
          variant={zone.pump_status ? "secondary" : "outline"}
          className={cn("ml-auto rounded-md px-1.5 py-1 text-[10px] font-extrabold tracking-wide")}
          aria-label={`Pump ${zone.pump_status ? "on" : "off"}`}
        >
          <span
            className={cn("h-1.5 w-1.5 rounded-full", zone.pump_status ? "bg-emerald-500" : "bg-slate-300")}
            aria-hidden
          />
          {zone.pump_status ? "ON" : "OFF"}
        </Badge>
      </div>

      <div className="mb-1 mt-4">
        <div className="text-2xl font-bold tracking-tight text-slate-900">
          {moisture === null ? "--" : `${moisture}%`}
        </div>
        <div className="text-[11px] text-slate-500">
          Soil moisture ·{" "}
          <span className={state === "dry" ? "font-semibold text-amber-600" : "text-slate-500"}>{label}</span>
        </div>
      </div>
      {moisture === null ? (
        <div className="mt-1 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-400">
          Waiting for sensor data
        </div>
      ) : (
        <Progress
          value={moisture}
          className="mt-1"
          aria-label={`Zone ${zone.zone_id} soil moisture ${moisture} percent`}
        />
      )}
      <div className="mt-auto flex items-center justify-between pt-3 text-[11px]">
        <span className="text-slate-400">Pump status</span>
        <span className={cn("font-semibold", zone.pump_status ? "text-emerald-600" : "text-slate-400")}>
          {zone.pump_status ? "● Running" : "○ Standby"}
        </span>
      </div>
    </Card>
  );
});
