import { Suspense, lazy, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { historyCsvUrl } from "@/api";
import { useHistory } from "@/hooks/useHistory";
import { formatDuration } from "@/lib/history";

const HistoryUsageChart = lazy(() => import("@/pages/HistoryUsageChart"));

const COLORS = ["#0e9c6a", "#3b82f6", "#f59e0b"];

export function HistoryPage({ deviceId }: { deviceId: string }) {
  const [zoneFilter, setZoneFilter] = useState<number | undefined>(undefined);
  const [triggerFilter, setTriggerFilter] = useState<string | undefined>(undefined);
  const { events, stats, loading, error } = useHistory(deviceId, {
    zoneId: zoneFilter,
    trigger: triggerFilter,
  });

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-6 max-md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Irrigation History</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {stats
              ? `${stats.total_events} events · ${stats.total_liters} L total · ${stats.today_liters} L today`
              : "Loading…"}
          </p>
        </div>
        <a
          href={historyCsvUrl(deviceId, { zoneId: zoneFilter, trigger: triggerFilter })}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          Export CSV
        </a>
      </div>

      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap gap-3 pt-5">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Zone
            <select
              value={zoneFilter ?? ""}
              onChange={(e) => setZoneFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="1">Zone 1</option>
              <option value="2">Zone 2</option>
              <option value="3">Zone 3</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Trigger
            <select
              value={triggerFilter ?? ""}
              onChange={(e) => setTriggerFilter(e.target.value || undefined)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="manual">Manual</option>
              <option value="auto">Auto</option>
              <option value="telemetry">Telemetry</option>
            </select>
          </label>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        {(stats?.per_zone ?? []).map((p, i) => (
          <Card key={p.zone_id} className="p-4">
            <div className="text-sm font-bold">Zone {p.zone_id}</div>
            <div className="mt-1 text-2xl font-extrabold">{p.liters} L</div>
            <div className="text-[11px] text-slate-500">{p.events} events</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${stats && stats.total_liters ? Math.round((p.liters / stats.total_liters) * 100) : 0}%`,
                  background: COLORS[i % COLORS.length],
                }}
              />
            </div>
          </Card>
        ))}
        {!stats?.per_zone.length && !loading && (
          <Card className="col-span-3 p-6 text-center text-sm text-slate-400">
            No irrigation events yet — toggle a pump in System Control.
          </Card>
        )}
      </div>

      {stats && stats.per_zone.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Water usage by zone (L)</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-[220px] w-full rounded-xl" />}>
              <HistoryUsageChart stats={stats} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Events ({events.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : !events.length ? (
            <p className="text-sm text-slate-400">No events match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-2">Zone</th>
                    <th className="px-2 py-2">Started</th>
                    <th className="px-2 py-2">Duration</th>
                    <th className="px-2 py-2">Water</th>
                    <th className="px-2 py-2">Moisture</th>
                    <th className="px-2 py-2">Trigger</th>
                    <th className="px-2 py-2">State</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="px-2 py-2 font-bold">Zone {e.zone_id}</td>
                      <td className="px-2 py-2 text-slate-600">{new Date(e.started_at).toLocaleString()}</td>
                      <td className="px-2 py-2">{formatDuration(e.duration_seconds)}</td>
                      <td className="px-2 py-2">{e.water_used_liters ?? "--"} L</td>
                      <td className="px-2 py-2 text-slate-600">
                        {e.moisture_before ?? "--"}% → {e.moisture_after ?? "…"}%
                      </td>
                      <td className="px-2 py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {e.trigger}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-semibold text-slate-700">
                        {e.ended_at ? "Done" : "● Running"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
