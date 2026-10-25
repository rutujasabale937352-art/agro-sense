import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { fetchZones } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/format";
import { cropForZone } from "@/lib/zones";
import type { TrendSample } from "@/pages/LiveTrend";
import type { DashboardSummary, ZoneInfo } from "@/types";

const LiveTrend = lazy(() => import("@/pages/LiveTrend"));

function pushSample(prev: TrendSample[], summary: DashboardSummary): TrendSample[] {
  if (!summary.system) return prev;
  const label = summary.last_updated
    ? new Date(summary.last_updated).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : new Date().toLocaleTimeString();
  const sample: TrendSample = {
    t: label,
    temperature: summary.system.temperature,
    humidity: summary.system.humidity,
    flow: summary.system.flow_rate,
  };
  for (const z of summary.zones) sample[`Z${z.zone_id}`] = z.soil_moisture;
  return [...prev.slice(-29), sample];
}

export function LivePage({ summary, deviceId }: { summary: DashboardSummary | null; deviceId: string }) {
  const [buffer, setBuffer] = useState<TrendSample[]>([]);
  const [tab, setTab] = useState<"moisture" | "environment">("moisture");
  const [zones, setZones] = useState<ZoneInfo[]>([]);

  const lastUpdated = summary?.last_updated;
  useEffect(() => {
    if (summary) {
      // Append live sample to the session trend buffer.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBuffer((prev) => pushSample(prev, summary));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdated]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchZones(deviceId);
        if (!cancelled) setZones(data.zones);
      } catch {
        /* live page stays usable with fallback crop names */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const cropOf = (zoneId: number) => zones.find((z) => z.zone_id === zoneId)?.crop ?? cropForZone(zoneId);
  const zoneCount = summary?.zones.length ?? 0;
  const zoneKeys = useMemo(
    () => (summary?.zones ?? []).map((z) => `Z${z.zone_id}`),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoneCount]
  );
  const moistureSummary = (summary?.zones ?? [])
    .map((z) => `Zone ${z.zone_id} ${z.soil_moisture} percent`)
    .join(", ");

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-6 max-md:p-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Live Sensor Data</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Streaming from {summary?.device_id ?? deviceId} ·{" "}
          {summary ? timeAgo(summary.last_updated) : "waiting…"} ·{" "}
          {summary?.system_status === "online" ? "online" : "offline"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current readings</CardTitle>
        </CardHeader>
        <CardContent>
          {!summary?.system ? (
            <p className="text-sm text-slate-400">Waiting for sensor data…</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm max-sm:grid-cols-1">
              {[
                ["Temperature", `${summary.system.temperature}°C`],
                ["Humidity", `${summary.system.humidity}%`],
                ["Water level", `${summary.system.water_level}%`],
                ["Rain", summary.system.rain ? "Detected" : "None"],
                ["Flow rate", `${summary.system.flow_rate} L/min`],
                ["Device", summary.device_id],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5"
                >
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-bold text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live trend</CardTitle>
          <div
            className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold"
            role="tablist"
            aria-label="Trend metric"
          >
            {(["moisture", "environment"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 capitalize ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-[11px] text-slate-400">
            Last {buffer.length} readings this session{moistureSummary ? ` — ${moistureSummary}` : ""}
          </p>
          {buffer.length < 2 ? (
            <Skeleton className="h-[240px] w-full rounded-xl" />
          ) : (
            <Suspense fallback={<Skeleton className="h-[260px] w-full rounded-xl" />}>
              <LiveTrend buffer={buffer} zoneKeys={zoneKeys} cropOf={cropOf} mode={tab} />
            </Suspense>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sensor status</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-[13px]">
            {(summary?.zones ?? []).map((z) => (
              <li
                key={z.zone_id}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5"
              >
                <span>
                  Zone {z.zone_id} · {cropOf(z.zone_id)} — {z.soil_moisture}% · pump{" "}
                  {z.pump_status ? "ON" : "OFF"}
                </span>
                <span
                  className={
                    summary?.system_status === "online"
                      ? "font-bold text-emerald-600"
                      : "font-bold text-slate-400"
                  }
                >
                  {summary?.system_status === "online" ? "● live" : "○ stale"}
                </span>
              </li>
            ))}
            {!summary?.zones.length && <li className="text-slate-400">No zones reporting yet.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
