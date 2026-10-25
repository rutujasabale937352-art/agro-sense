import { useEffect, useState } from "react";
import { Leaf } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { fetchAnalysis } from "@/api";
import { timeAgo } from "@/lib/format";
import type { PlantAnalysis } from "@/types";

const HEALTH_STYLE: Record<string, string> = {
  excellent: "bg-emerald-100 text-emerald-800",
  good: "bg-lime-100 text-lime-800",
  stressed: "bg-amber-100 text-amber-900",
  critical: "bg-red-100 text-red-800",
  unknown: "bg-slate-100 text-slate-500",
};

export function AnalysisPage({ deviceId }: { deviceId: string }) {
  const [data, setData] = useState<PlantAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Fetch on mount / device change — syncing external backend state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    (async () => {
      try {
        const res = await fetchAnalysis(deviceId);
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load analysis");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-6 max-md:p-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Plant Analysis</h1>
        <p className="mt-1 text-[13px] text-slate-500">
          Rule-based health from live moisture, heat and humidity ·{" "}
          {data ? `evaluated ${timeAgo(data.evaluated_at)}` : "loading…"}
        </p>
      </div>
      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        {loading
          ? [1, 2, 3].map((i) => <Card key={i} className="h-[260px] animate-pulse bg-slate-100" />)
          : data?.zones.map((z) => (
              <Card key={z.zone_id} className="p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Leaf size={18} aria-hidden />
                  </span>
                  <div>
                    <div className="text-sm font-bold">
                      Zone {z.zone_id} · {z.crop}
                    </div>
                    <div className="text-[11px] text-slate-500">{z.growth_stage}</div>
                  </div>
                  <Badge className={`ml-auto ${HEALTH_STYLE[z.health]}`}>
                    {z.health} · {z.health_score}
                  </Badge>
                </div>
                <Progress
                  value={z.health_score}
                  className="mt-3"
                  aria-label={`Zone ${z.zone_id} health ${z.health_score}`}
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Target {z.recommended_moisture.min}–{z.recommended_moisture.max}%
                </div>
                {!!z.issues.length && (
                  <ul className="mt-3 grid gap-1.5">
                    {z.issues.map((issue, i) => (
                      <li key={i} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900">
                        <span aria-hidden>⚠ </span>
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="mt-2 grid gap-1.5">
                  {z.recommendations.map((r, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-emerald-50/70 px-2.5 py-1.5 text-[12px] text-emerald-900"
                    >
                      <span aria-hidden>✓ </span>
                      {r}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Environment at evaluation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3 text-sm max-md:grid-cols-2">
            {[
              [
                "Temperature",
                data?.environment.temperature != null ? `${data.environment.temperature}°C` : "--",
              ],
              ["Humidity", data?.environment.humidity != null ? `${data.environment.humidity}%` : "--"],
              [
                "Water level",
                data?.environment.water_level != null ? `${data.environment.water_level}%` : "--",
              ],
              ["Rain", data?.environment.rain == null ? "--" : data.environment.rain ? "Yes" : "No"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                <div className="text-[11px] text-slate-500">{k}</div>
                <div className="font-bold">{v}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
