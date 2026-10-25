import { useState } from "react";
import { Sprout } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MoistureChart } from "@/components/dashboard/MoistureChart";
import { updateZoneSettings } from "@/api";
import { useZones } from "@/hooks/useZones";

const HEALTH_META: Record<string, { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "bg-emerald-100 text-emerald-800" },
  dry: { label: "Needs water", cls: "bg-amber-100 text-amber-800" },
  saturated: { label: "Saturated", cls: "bg-sky-100 text-sky-800" },
  unknown: { label: "Unknown", cls: "bg-slate-100 text-slate-500" },
};

export function ZonesPage({ deviceId }: { deviceId: string }) {
  const { zones, mode, loading, error, reload, setZones } = useZones(deviceId);
  const [editing, setEditing] = useState<Record<number, { min: string; max: string }>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const save = async (zoneId: number) => {
    const draft = editing[zoneId];
    if (!draft) return;
    const min = Number(draft.min);
    const max = Number(draft.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100) {
      setFormError("Thresholds must be numbers between 0 and 100.");
      return;
    }
    if (min >= max) {
      setFormError("Minimum must be below maximum.");
      return;
    }
    setFormError(null);
    setSaving(zoneId);
    try {
      const res = await updateZoneSettings(deviceId, zoneId, { moisture_min: min, moisture_max: max });
      setZones((prev) => prev.map((z) => (z.zone_id === zoneId ? { ...z, ...res.zone } : z)));
      setEditing((e) => {
        const next = { ...e };
        delete next[zoneId];
        return next;
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-6 max-md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Zones</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            Independent monitoring · mode: <strong>{mode}</strong> · thresholds drive dry/saturated health.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          Refresh
        </Button>
      </div>
      {error && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"
          role="alert"
        >
          {error}
        </div>
      )}
      {formError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"
          role="alert"
        >
          {formError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        {loading
          ? [1, 2, 3].map((i) => <Card key={i} className="h-[220px] animate-pulse bg-slate-100" />)
          : zones.map((z) => {
              const h = HEALTH_META[z.health] ?? HEALTH_META.unknown;
              const draft = editing[z.zone_id];
              return (
                <Card key={z.zone_id} className="p-4">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Sprout size={18} aria-hidden />
                    </span>
                    <div>
                      <div className="text-sm font-bold">
                        Zone {z.zone_id} · {z.crop}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {z.soil_moisture ?? "--"}% soil moisture
                      </div>
                    </div>
                    <Badge className={`ml-auto ${h.cls}`}>{h.label}</Badge>
                  </div>
                  <div className="mt-3 text-2xl font-extrabold">{z.soil_moisture ?? "--"}%</div>
                  {z.soil_moisture === null ? (
                    <div className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] text-slate-400">
                      Waiting for sensor data
                    </div>
                  ) : (
                    <Progress value={z.soil_moisture} className="mt-2" />
                  )}
                  <div className="mt-2 text-[11px] text-slate-500">
                    Target {z.moisture_min}–{z.moisture_max}% · pump {z.pump_status ? "ON" : "OFF"}
                  </div>
                  {draft ? (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        aria-label={`Zone ${z.zone_id} minimum moisture`}
                        type="number"
                        min={0}
                        max={100}
                        value={draft.min}
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, [z.zone_id]: { ...draft, min: e.target.value } }))
                        }
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <span className="text-slate-400">–</span>
                      <input
                        aria-label={`Zone ${z.zone_id} maximum moisture`}
                        type="number"
                        min={0}
                        max={100}
                        value={draft.max}
                        onChange={(e) =>
                          setEditing((p) => ({ ...p, [z.zone_id]: { ...draft, max: e.target.value } }))
                        }
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <Button size="sm" onClick={() => void save(z.zone_id)} disabled={saving === z.zone_id}>
                        {saving === z.zone_id ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 px-0 text-emerald-700"
                      onClick={() =>
                        setEditing((e) => ({
                          ...e,
                          [z.zone_id]: { min: String(z.moisture_min), max: String(z.moisture_max) },
                        }))
                      }
                    >
                      Edit thresholds →
                    </Button>
                  )}
                </Card>
              );
            })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <MoistureChart zones={zones} />
        </CardContent>
      </Card>
    </div>
  );
}
