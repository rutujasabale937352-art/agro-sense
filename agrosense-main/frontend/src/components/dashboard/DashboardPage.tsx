import { useMemo } from "react";
import { AlertTriangle, CloudRain, Droplets, Gauge, Thermometer, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "./MetricCard";
import { MoistureChart } from "./MoistureChart";
import { PumpDonut } from "./PumpDonut";
import { ZoneCard, type ZoneCardData } from "./ZoneCard";
import { formatDate, greetingForHour, timeAgo } from "@/lib/format";
import type { DashboardSummary, IrrigationStats, ZoneInfo } from "@/types";

function Panel({
  title,
  actionLabel,
  onAction,
  children,
  className,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {actionLabel &&
          (onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              {actionLabel} <span aria-hidden>→</span>
            </button>
          ) : (
            <span className="text-[11px] font-medium text-slate-400">{actionLabel}</span>
          ))}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DashboardPage({
  summary,
  zones: backendZones,
  stats,
  error,
  loading,
  onRetry,
  onNavigate,
}: {
  summary: DashboardSummary | null;
  zones: ZoneInfo[];
  stats: IrrigationStats | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
  onNavigate: (view: "history" | "zones" | "live") => void;
}) {
  const system = summary?.system;
  const zones: ZoneCardData[] = useMemo(() => {
    const live = summary?.zones ?? [];
    return live.map((z) => {
      const cfg = backendZones.find((b) => b.zone_id === z.zone_id);
      return {
        zone_id: z.zone_id,
        crop: cfg?.crop,
        soil_moisture: z.soil_moisture,
        pump_status: z.pump_status,
        moisture_min: cfg?.moisture_min,
        moisture_max: cfg?.moisture_max,
      };
    });
  }, [summary?.zones, backendZones]);
  const activePumps = useMemo(() => zones.filter((z) => z.pump_status).length, [zones]);
  const avg = useMemo(
    () =>
      zones.length ? Math.round(zones.reduce((t, z) => t + (z.soil_moisture ?? 0), 0) / zones.length) : 0,
    [zones]
  );
  const hour = new Date().getHours();
  const lowWater = system != null && system.water_level < 20;
  const raining = system?.rain ?? false;
  const online = summary?.system_status === "online";
  const lastUpdated = summary?.last_updated ?? null;
  const readingAgeMs = useMemo(
    // Staleness heuristic re-evaluated per reading; exact ms doesn't matter.
    // eslint-disable-next-line react-hooks/purity
    () => (lastUpdated ? Date.now() - new Date(lastUpdated).getTime() : Infinity),
    [lastUpdated]
  );
  const noFlow = system != null && activePumps > 0 && system.flow_rate < 0.2 && readingAgeMs > 90_000;
  const maxZoneLiters = Math.max(0, ...(stats?.per_zone.map((p) => p.liters) ?? [0]));

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-4 p-6 max-md:p-4">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
            {formatDate(new Date())}
          </p>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-tight text-slate-900 max-sm:text-2xl">
            {greetingForHour(hour)}, Admin{" "}
            <span className="text-amber-400" aria-hidden>
              ✦
            </span>
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">Here’s what’s happening with your farm today.</p>
        </div>
        <Badge
          variant="outline"
          className="flex-col items-start gap-0.5 rounded-xl bg-emerald-50/60 px-3.5 py-2.5"
        >
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
            <span
              className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`}
              aria-hidden
            />
            {summary?.device_id ?? "AGROSENSE01"}
            <span className="font-semibold text-slate-500">· {online ? "Online" : "Offline"}</span>
          </span>
          <span className="text-[10px] font-medium text-slate-400">
            Device ID · {summary ? timeAgo(summary.last_updated) : "—"}
          </span>
        </Badge>
      </section>

      {error && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"
          role="alert"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Retry
          </button>
        </div>
      )}

      {(lowWater || raining) && system && (
        <div
          className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900"
          role="status"
        >
          <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {lowWater && (
              <>
                <strong>Low tank level ({system.water_level}%).</strong> Pumps should be supervised.{" "}
              </>
            )}
            {raining && <span>Rain detected — consider pausing scheduled irrigation.</span>}
          </span>
        </div>
      )}

      <section
        aria-label="Live metrics"
        className="grid grid-cols-5 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1"
      >
        <MetricCard
          icon={Thermometer}
          label="Temperature"
          value={system ? `${system.temperature}°C` : loading ? "…" : "--"}
          tone="red"
          alert={system != null && system.temperature > 38}
        />
        <MetricCard
          icon={Droplets}
          label="Humidity"
          value={system ? `${system.humidity}%` : loading ? "…" : "--"}
          tone="blue"
        />
        <MetricCard
          icon={Gauge}
          label="Water level"
          value={system ? `${system.water_level}%` : loading ? "…" : "--"}
          tone="cyan"
          alert={lowWater}
          sub={lowWater ? "Low — check tank" : "Live reading"}
        />
        <MetricCard
          icon={CloudRain}
          label="Rain status"
          value={system ? (system.rain ? "Rain detected" : "No rain") : loading ? "…" : "--"}
          tone="slate"
        />
        <MetricCard
          icon={Waves}
          label="Flow rate"
          value={system ? `${system.flow_rate} L/min` : loading ? "…" : "--"}
          tone="purple"
          alert={noFlow}
          sub={noFlow ? "Pump on, low flow!" : "Live reading"}
        />
      </section>

      <section className="grid grid-cols-5 gap-4 max-xl:grid-cols-1 xl:grid-cols-5">
        <Panel title="Soil moisture by zone" actionLabel={`${avg}% average`} className="xl:col-span-3">
          {zones.length ? (
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
              {zones.map((z) => (
                <ZoneCard key={z.zone_id} zone={z} />
              ))}
            </div>
          ) : (
            <div className="grid h-[186px] place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
              {loading ? "Loading sensor data…" : "Waiting for sensor data"}
            </div>
          )}
        </Panel>
        <Panel
          title="Water usage today"
          actionLabel="View history"
          onAction={() => onNavigate("history")}
          className="xl:col-span-2"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900">
              {summary?.water_usage_liters == null ? "--" : `${summary.water_usage_liters} L`}
            </span>
            <span className="text-xs text-slate-500">
              {stats && stats.total_events > 0
                ? `${stats.total_events} events · all zones`
                : "No irrigation events yet"}
            </span>
          </div>
          {stats && stats.per_zone.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {stats.per_zone.map((p) => (
                <li key={p.zone_id} className="text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold text-slate-600">Zone {p.zone_id}</span>
                    <span className="text-slate-500">
                      {p.liters} L · {p.events} events
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-valuenow={p.liters}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(maxZoneLiters, 1)}
                    aria-label={`Zone ${p.zone_id} water usage ${p.liters} liters`}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400"
                      style={{
                        width: `${maxZoneLiters ? Math.round((p.liters / maxZoneLiters) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 flex min-h-[133px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
              <Droplets size={26} className="text-sky-500" aria-hidden />
              <span>Toggle a pump in System Control to record the first event.</span>
            </div>
          )}
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-7">
        <Panel
          title="Soil moisture overview"
          actionLabel="Live data"
          onAction={() => onNavigate("live")}
          className="xl:col-span-3"
        >
          <MoistureChart zones={zones} />
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <span className="h-0.5 w-6 rounded bg-emerald-500" aria-hidden /> Zone moisture (%)
          </div>
        </Panel>
        <Panel title="Pump status" className="xl:col-span-2">
          <div className="grid place-items-center py-2">
            <PumpDonut
              zones={zones.map((z) => ({
                zone_id: z.zone_id,
                soil_moisture: z.soil_moisture ?? 0,
                pump_status: z.pump_status,
              }))}
            />
          </div>
        </Panel>
        <Panel title="System status" className="xl:col-span-2">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
            <span
              className={`grid h-14 w-14 place-items-center rounded-2xl ${online ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-400"}`}
            >
              <Waves size={28} aria-hidden />
            </span>
            <div>
              <div className="text-base font-bold text-slate-900">{online ? "Online" : "Offline"}</div>
              <p className="text-xs text-slate-500">
                {online ? "All systems running normally" : "Waiting for device data"}
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-emerald-50/70 px-3 py-2.5 text-xs text-emerald-800">
            {summary?.last_updated
              ? `Last update ${timeAgo(summary.last_updated)}`
              : "No readings received yet"}
          </div>
        </Panel>
      </section>

      <section className="flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-lime-500 p-5 text-white">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15" aria-hidden>
          🌿
        </span>
        <div className="min-w-0">
          <div className="font-bold">Healthy plants</div>
          <div className="truncate text-sm text-white/85 max-sm:whitespace-normal">
            Smarter irrigation for a greener tomorrow
          </div>
        </div>
        <div className="ml-auto hidden gap-2 text-xs font-semibold md:flex" aria-hidden>
          <span className="rounded-full bg-white/15 px-3 py-1.5">−28% water</span>
          <span className="rounded-full bg-white/15 px-3 py-1.5">+12% yield</span>
        </div>
      </section>
    </div>
  );
}
