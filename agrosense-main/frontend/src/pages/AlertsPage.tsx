import { useState } from "react";
import { BellOff, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAlerts } from "@/hooks/useAlerts";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEVERITY: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-900",
  info: "bg-sky-100 text-sky-800",
};

export function AlertsPage({ deviceId }: { deviceId: string }) {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const { alerts, unread, loading, error, ack, ackAll } = useAlerts(deviceId, showUnreadOnly);

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-4 p-6 max-md:p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Alerts</h1>
          <p className="mt-1 text-[13px] text-slate-500">
            {unread} unread · rules evaluate on every telemetry ingest · 15-min dedupe per type/zone.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUnreadOnly((v) => !v)}
            aria-pressed={showUnreadOnly}
          >
            <BellOff size={15} aria-hidden /> {showUnreadOnly ? "Show all" : "Unread only"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void ackAll()} disabled={!unread}>
            <CheckCheck size={15} aria-hidden /> Mark all read
          </Button>
        </div>
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
        <CardHeader>
          <CardTitle>
            {showUnreadOnly ? `Unread (${alerts.length})` : `All alerts (${alerts.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : !alerts.length ? (
            <p className="text-sm text-slate-400">All clear — no alerts match this filter.</p>
          ) : (
            <ul className="grid gap-2">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-xl border px-3.5 py-3",
                    a.read ? "border-slate-100 bg-slate-50/60 opacity-75" : "border-slate-200 bg-white"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={SEVERITY[a.severity] ?? SEVERITY.info}>{a.severity}</Badge>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {a.type.replace("_", " ")}
                        {a.zone_id ? ` · zone ${a.zone_id}` : ""}
                      </span>
                      <span className="text-[11px] text-slate-400">{timeAgo(a.created_at)}</span>
                    </div>
                    <p className="mt-1 text-[13px] text-slate-700">{a.message}</p>
                  </div>
                  {!a.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-emerald-700"
                      onClick={() => void ack(a.id)}
                    >
                      Mark read
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
