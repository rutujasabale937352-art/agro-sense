import { useEffect, useState } from "react";
import { Power, RadioTower, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMode, fetchZones, setPump, updateMode, updateZoneSettings, type CommandAckUpdate } from "@/api";
import { timeAgo } from "@/lib/format";
import { getSocket } from "@/lib/socket";
import type { DashboardSummary, ZoneInfo } from "@/types";

export function ControlPage({ summary, deviceId }: { summary: DashboardSummary | null; deviceId: string }) {
  const [config, setConfig] = useState<ZoneInfo[]>([]);
  const [mode, setModeState] = useState<"auto" | "manual">("auto");
  const [pending, setPending] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<{ zone: number; text: string } | null>(null);

  // Zone config (thresholds, crops) changes rarely — fetch once per device.
  // Live pump/moisture state comes from the `summary` prop (socket-driven).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [z, m] = await Promise.all([fetchZones(deviceId), fetchMode(deviceId)]);
        if (cancelled) return;
        setConfig(z.zones);
        setModeState(m.mode);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load control state");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    const socket = getSocket();
    const onAck = (ack: CommandAckUpdate) => {
      setDelivery({
        zone: ack.zone_id,
        text: `Device ${ack.ok ? "acknowledged" : "rejected"} zone ${ack.zone_id} ${ack.action.toUpperCase()}${ack.message ? ` — ${ack.message}` : ""}`,
      });
    };
    socket.on("command:update", onAck);
    return () => {
      socket.off("command:update", onAck);
    };
  }, []);

  const liveByZone = new Map((summary?.zones ?? []).map((z) => [z.zone_id, z]));
  const rows = config.map((c) => ({
    ...c,
    soil_moisture: liveByZone.get(c.zone_id)?.soil_moisture ?? c.soil_moisture,
    pump_status: liveByZone.get(c.zone_id)?.pump_status ?? c.pump_status,
  }));

  const flipMode = async () => {
    const next = mode === "auto" ? "manual" : "auto";
    try {
      const res = await updateMode(deviceId, next);
      setModeState(res.mode);
      setNotice(
        `System mode → ${res.mode}. ${res.mode === "auto" ? "Dry zones water themselves; rain and low-tank guards active." : "Manual overrides allowed; auto-watering paused."}`
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mode update failed");
    }
  };

  const togglePump = async (zone: ZoneInfo & { pump_status: boolean }) => {
    setPending(zone.zone_id);
    setNotice(null);
    setError(null);
    setDelivery(null);
    try {
      const res = await setPump(deviceId, zone.zone_id, zone.pump_status ? "off" : "on");
      if (res.already) {
        setNotice(
          `Zone ${zone.zone_id} pump is already ${res.pump_status ? "ON" : "OFF"} — no command sent.`
        );
      } else if (res.warning) {
        setNotice(res.warning);
      } else {
        setNotice(`Zone ${zone.zone_id} pump ${res.pump_status ? "started" : "stopped"} (manual).`);
      }
      if (res.command) {
        setDelivery({
          zone: zone.zone_id,
          text:
            res.command.delivery === "sent"
              ? `Command ${res.command.request_id.slice(0, 8)}… sent to device — waiting for ack.`
              : res.command.delivery === "offline"
                ? "Broker offline — command applied to simulator only."
                : "MQTT disabled — command applied to simulator only. Enable MQTT for hardware.",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pump command failed");
    } finally {
      setPending(null);
    }
  };

  const nudgeThreshold = async (zone: ZoneInfo, delta: number) => {
    const next = Math.max(0, Math.min(zone.moisture_max - 1, zone.moisture_min + delta));
    if (next === zone.moisture_min) return;
    try {
      const res = await updateZoneSettings(deviceId, zone.zone_id, { moisture_min: next });
      setConfig((prev) => prev.map((z) => (z.zone_id === zone.zone_id ? { ...z, ...res.zone } : z)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Threshold update failed");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-6 max-md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">System Control</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {mode === "auto"
              ? "Auto-watering active: dry zones start, saturated zones stop (rain + low-tank guards on)."
              : "Manual mode — you own every pump; auto-watering paused."}{" "}
            · {summary ? timeAgo(summary.last_updated) : "—"}
          </p>
        </div>
        <Button onClick={() => void flipMode()} aria-pressed={mode === "manual"}>
          <Power size={16} aria-hidden /> Switch to {mode === "auto" ? "manual" : "auto"}
        </Button>
      </div>

      {notice && (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900"
          role="status"
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800"
          role="alert"
        >
          <ShieldAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
        {rows.map((z) => (
          <Card key={z.zone_id} className="p-4">
            <div className="flex items-center gap-2">
              <strong className="text-sm">
                Zone {z.zone_id} · {z.crop}
              </strong>
              <Badge variant={z.pump_status ? "secondary" : "outline"} className="ml-auto">
                {z.pump_status ? "ON" : "OFF"}
              </Badge>
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              {z.soil_moisture ?? "--"}% · target {z.moisture_min}–{z.moisture_max}%
            </div>
            <Button
              className="mt-3 w-full"
              variant={z.pump_status ? "outline" : "default"}
              disabled={pending === z.zone_id}
              onClick={() => void togglePump(z)}
            >
              {pending === z.zone_id ? "Sending…" : z.pump_status ? "Stop pump" : "Start pump"}
            </Button>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Dry threshold {z.moisture_min}%</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Lower zone ${z.zone_id} threshold`}
                  disabled={z.moisture_min <= 0}
                  onClick={() => void nudgeThreshold(z, -1)}
                  className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={`Raise zone ${z.zone_id} threshold`}
                  disabled={z.moisture_min + 1 >= z.moisture_max}
                  onClick={() => void nudgeThreshold(z, 1)}
                  className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
                >
                  +
                </button>
              </span>
            </div>
          </Card>
        ))}
      </div>

      {delivery && (
        <div
          className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900"
          role="status"
        >
          <RadioTower size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Zone {delivery.zone}: {delivery.text}
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Safety interlocks (enforced by backend)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-[13px] text-slate-600">
            <li className="rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span aria-hidden>🔋</span> Tank below 15% blocks pump-start commands (HTTP 409).
            </li>
            <li className="rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span aria-hidden>🌧</span> Auto mode pauses watering while raining; manual can override with a
              warning.
            </li>
            <li className="rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span aria-hidden>⏱</span> Events running over 60 minutes are auto-closed as a runaway-pump
              guard.
            </li>
            <li className="rounded-xl bg-slate-50 px-3.5 py-2.5">
              <span aria-hidden>🚰</span> Pump ON with low flow raises a critical pump-anomaly alert.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
