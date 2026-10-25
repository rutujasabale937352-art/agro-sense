import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMode, fetchPendingCommands, fetchReadiness, fetchZones, historyCsvUrl } from "@/api";
import type { DashboardSummary, DeviceControl, ZoneInfo } from "@/types";

type Prefs = { lowMoisture: boolean; tank: boolean; rain: boolean; pump: boolean };

const PREFS_KEY = "agrosense-notif-prefs";

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { lowMoisture: true, tank: true, rain: true, pump: true, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { lowMoisture: true, tank: true, rain: true, pump: true };
}

export function SettingsPage({ summary, deviceId }: { summary: DashboardSummary | null; deviceId: string }) {
  const [control, setControl] = useState<DeviceControl | null>(null);
  const [zones, setZones] = useState<ZoneInfo[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [saved, setSaved] = useState(false);
  const [infra, setInfra] = useState<{ database: string; mqtt: string; pending: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [m, z, r, p] = await Promise.all([
          fetchMode(deviceId),
          fetchZones(deviceId),
          fetchReadiness(),
          fetchPendingCommands(deviceId).catch(() => null),
        ]);
        setControl(m);
        setZones(z.zones);
        setInfra({
          database: r.database,
          mqtt: r.mqtt.enabled ? (r.mqtt.connected ? "connected" : "offline") : "disabled",
          pending: p?.commands.filter((c) => c.status === "sent").length ?? 0,
        });
      } catch {
        /* settings stays usable offline */
      }
    })();
  }, [deviceId]);

  const savedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  const togglePref = (key: keyof Prefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-4 p-6 max-md:p-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-[13px] text-slate-500">Device, thresholds, notifications and data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Device</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm max-sm:grid-cols-1">
            {[
              ["Device ID", summary?.device_id ?? deviceId],
              ["Mode", control?.mode ?? summary?.mode ?? "auto"],
              ["System", summary?.system_status ?? "—"],
              ["Last update", summary?.last_updated ? new Date(summary.last_updated).toLocaleString() : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11px] text-slate-400">
            Wi-Fi provisioning lives on the ESP32 captive portal — thresholds below are the cloud-side guards.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Moisture thresholds</CardTitle>
          <span className="text-[11px] text-slate-400">Edit per-zone in Zones</span>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-[13px]">
            {zones.map((z) => (
              <li
                key={z.zone_id}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5"
              >
                <span>
                  Zone {z.zone_id} · {z.crop}
                </span>
                <strong>
                  {z.moisture_min}–{z.moisture_max}%
                </strong>
              </li>
            ))}
            {!zones.length && <li className="text-slate-400">Loading thresholds…</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          {saved && (
            <span className="text-[11px] font-semibold text-emerald-600">
              Saved <span aria-hidden>✓</span>
            </span>
          )}
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {(
              [
                ["lowMoisture", "Low soil moisture"],
                ["tank", "Low tank level"],
                ["rain", "Rain detected"],
                ["pump", "Pump anomalies"],
              ] as Array<[keyof Prefs, string]>
            ).map(([key, label]) => (
              <li
                key={key}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm"
              >
                <span>{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs[key]}
                  aria-label={label}
                  onClick={() => togglePref(key)}
                  className={`relative h-6 w-11 rounded-full transition ${prefs[key] ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs[key] ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">
            Stored locally in this browser; backend alert rules always evaluate.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hardware & simulator</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-[13px]">
            <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span>Database</span>
              <strong>{infra?.database ?? "…"}</strong>
            </li>
            <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span>MQTT broker</span>
              <strong>{infra?.mqtt ?? "…"}</strong>
            </li>
            <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span>Commands awaiting ack</span>
              <strong>{infra?.pending ?? "…"}</strong>
            </li>
          </ul>
          <p className="mt-2 text-[12px] text-slate-500">
            No hardware? Run the simulator in a second terminal:
          </p>
          <code className="mt-1 block overflow-x-auto rounded-xl bg-slate-900 px-3.5 py-2.5 font-mono text-[12px] text-emerald-200">
            cd backend && npm run sim -- --port 4000 --interval 5
          </code>
          <p className="mt-2 text-[11px] text-slate-400">
            Device command topic: <span className="font-mono">agrosense/{"{device}"}/commands</span> · acks:{" "}
            <span className="font-mono">agrosense/{"{device}"}/commands/ack</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data management</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <a
            href={historyCsvUrl(summary?.device_id ?? deviceId)}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Download irrigation CSV
          </a>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh live data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
