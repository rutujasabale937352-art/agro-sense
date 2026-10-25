import { randomUUID } from "crypto";
import { Pool } from "pg";
import { env } from "../config/env";
import type { AlertItem, AlertSeverity, AlertType } from "../types/irrigation";
import type { TelemetryPayload } from "../types/telemetry";

const DEDUPE_MINUTES = 15;
const MAX_ALERTS = 200;

export class AlertService {
  private alerts: AlertItem[] = [];
  private pool: Pool | null = env.DATABASE_URL ? new Pool({ connectionString: env.DATABASE_URL }) : null;
  private ready = false;

  constructor() {
    this.pool?.on("error", (error) => console.error("PostgreSQL pool error (alerts)", error.message));
  }

  async initialize(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT NOT NULL,
          zone_id INTEGER,
          created_at TIMESTAMPTZ NOT NULL,
          read BOOLEAN NOT NULL DEFAULT FALSE
        );
        CREATE INDEX IF NOT EXISTS alerts_device_time_idx ON alerts (device_id, created_at DESC);
      `);
      const res = await this.pool.query(`SELECT * FROM alerts ORDER BY created_at DESC LIMIT 200`);
      this.alerts = res.rows.map((r) => ({
        id: String(r.id),
        device_id: String(r.device_id),
        type: r.type as AlertType,
        severity: r.severity as AlertSeverity,
        message: String(r.message),
        zone_id: r.zone_id ?? null,
        created_at: new Date(r.created_at).toISOString(),
        read: Boolean(r.read),
      }));
      this.ready = true;
    } catch (error) {
      console.error("Alerts persistence unavailable; using in-memory store.", error);
      await this.pool.end().catch(() => undefined);
      this.pool = null;
    }
  }

  evaluate(
    payload: TelemetryPayload,
    thresholds?: Map<number, number>,
    fallbackMin = 25,
    maturedZones?: Set<number>
  ): AlertItem[] {
    const created: AlertItem[] = [];
    const push = (type: AlertType, severity: AlertSeverity, message: string, zoneId: number | null) => {
      if (this.isDuplicate(payload.device_id, type, zoneId)) return;
      const alert: AlertItem = {
        id: randomUUID(),
        device_id: payload.device_id,
        type,
        severity,
        message,
        zone_id: zoneId,
        created_at: payload.timestamp ?? new Date().toISOString(),
        read: false,
      };
      this.alerts.unshift(alert);
      created.push(alert);
      void this.persist(alert);
    };

    const s = payload.system;
    if (s.water_level < 15) push("low_water", "critical", `Critical tank level: ${s.water_level}% — pumps blocked for safety.`, null);
    else if (s.water_level < 25) push("low_water", "warning", `Low water tank: ${s.water_level}% remaining.`, null);
    if (s.temperature > 38) push("high_temperature", "warning", `High temperature: ${s.temperature}°C — check heat stress.`, null);
    if (s.rain) push("rain", "info", "Rain detected — scheduled irrigation should pause.", null);

    for (const z of payload.zones) {
      const min = thresholds?.get(z.zone_id) ?? fallbackMin;
      if (z.soil_moisture < min)
        push("low_moisture", "warning", `Zone ${z.zone_id} is dry at ${z.soil_moisture}% (below ${min}%).`, z.zone_id);
      // Only flag flow anomalies for pumps running a while — a fresh start
      // legitimately reads ~0 flow during spin-up (e.g. right after a command).
      const matured = maturedZones ? maturedZones.has(z.zone_id) : true;
      if (z.pump_status && s.flow_rate < 0.2 && matured)
        push("pump_anomaly", "critical", `Zone ${z.zone_id} pump is ON but flow is ${s.flow_rate} L/min — check lines/pump.`, z.zone_id);
    }

    if (this.alerts.length > MAX_ALERTS) this.alerts.length = MAX_ALERTS;
    return created;
  }

  pushSystem(deviceId: string, message: string, severity: AlertSeverity = "info"): AlertItem {
    const recent = this.alerts.find(
      (a) =>
        a.device_id === deviceId &&
        a.type === "system" &&
        a.message === message &&
        Date.now() - new Date(a.created_at).getTime() < 15 * 60 * 1000
    );
    if (recent) return recent;
    const alert: AlertItem = {
      id: randomUUID(),
      device_id: deviceId,
      type: "system",
      severity,
      message,
      zone_id: null,
      created_at: new Date().toISOString(),
      read: false,
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > MAX_ALERTS) this.alerts.length = MAX_ALERTS;
    void this.persist(alert);
    return alert;
  }

  /** Record an offline alert when a device has gone stale. Idempotent per window. */
  checkOffline(deviceId: string, lastUpdated: string | null): AlertItem | null {
    if (!lastUpdated || Date.now() - new Date(lastUpdated).getTime() < 5 * 60 * 1000) return null;
    if (this.isDuplicate(deviceId, "offline", null)) return null;
    const alert: AlertItem = {
      id: randomUUID(),
      device_id: deviceId,
      type: "offline",
      severity: "warning",
      message: `Device ${deviceId} is offline — no telemetry for over 5 minutes.`,
      zone_id: null,
      created_at: new Date().toISOString(),
      read: false,
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > MAX_ALERTS) this.alerts.length = MAX_ALERTS;
    void this.persist(alert);
    return alert;
  }

  list(deviceId: string, opts: { unreadOnly?: boolean; limit?: number }): { alerts: AlertItem[]; unread: number } {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const mine = this.alerts.filter((a) => a.device_id === deviceId);
    return {
      alerts: mine.filter((a) => !opts.unreadOnly || !a.read).slice(0, limit).map((a) => ({ ...a })),
      unread: mine.filter((a) => !a.read).length,
    };
  }

  async markRead(id: string): Promise<AlertItem | null> {
    const found = this.alerts.find((a) => a.id === id);
    if (!found) return null;
    found.read = true;
    if (this.pool && this.ready) {
      await this.pool.query(`UPDATE alerts SET read = TRUE WHERE id = $1`, [id]).catch((e) => console.error(e));
    }
    return found;
  }

  async markAllRead(deviceId: string): Promise<number> {
    let count = 0;
    for (const a of this.alerts) {
      if (a.device_id === deviceId && !a.read) {
        a.read = true;
        count += 1;
      }
    }
    if (this.pool && this.ready && count) {
      await this.pool.query(`UPDATE alerts SET read = TRUE WHERE device_id = $1 AND read = FALSE`, [deviceId]).catch((e) => console.error(e));
    }
    return count;
  }

  async close(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }

  private isDuplicate(deviceId: string, type: AlertType, zoneId: number | null): boolean {
    // Intentionally includes read alerts: acknowledging quiets the rule until
    // the window expires instead of re-firing on the next telemetry tick.
    const cutoff = Date.now() - DEDUPE_MINUTES * 60 * 1000;
    return this.alerts.some(
      (a) =>
        a.device_id === deviceId &&
        a.type === type &&
        (a.zone_id ?? null) === (zoneId ?? null) &&
        new Date(a.created_at).getTime() > cutoff
    );
  }

  private async persist(alert: AlertItem): Promise<void> {
    if (!this.pool || !this.ready) return;
    try {
      await this.pool.query(
        `INSERT INTO alerts (id, device_id, type, severity, message, zone_id, created_at, read)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [alert.id, alert.device_id, alert.type, alert.severity, alert.message, alert.zone_id, alert.created_at, alert.read]
      );
    } catch (error) {
      console.error("Alert persistence failed", error);
    }
  }
}
