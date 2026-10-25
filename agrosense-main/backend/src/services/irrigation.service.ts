import { randomUUID } from "crypto";
import { Pool } from "pg";
import { env } from "../config/env";
import type {
  DeviceControlState,
  IrrigationEvent,
  PumpTrigger,
  SystemMode,
  ZoneSettings,
} from "../types/irrigation";
import type { TelemetryPayload } from "../types/telemetry";

const DEFAULT_CROPS: Record<number, string> = { 1: "Mango", 2: "Tomato", 3: "Chili" };
const MAX_PUMP_MINUTES = 60;

export class IrrigationService {
  private events: IrrigationEvent[] = [];
  private controlByDevice = new Map<string, DeviceControlState>();
  private pool: Pool | null = env.DATABASE_URL ? new Pool({ connectionString: env.DATABASE_URL }) : null;
  private ready = false;
  /** Manual overrides hold off auto-regulation per zone so the two never fight. */
  private manualHoldUntil = new Map<string, number>();
  private static readonly MANUAL_HOLD_MS = 30 * 60 * 1000;

  constructor(private readonly maxPumpMinutes = MAX_PUMP_MINUTES) {
    this.pool?.on("error", (error) => console.error("PostgreSQL pool error (irrigation)", error.message));
  }

  async initialize(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS irrigation_events (
          id TEXT PRIMARY KEY,
          device_id TEXT NOT NULL,
          zone_id INTEGER NOT NULL,
          started_at TIMESTAMPTZ NOT NULL,
          ended_at TIMESTAMPTZ,
          duration_seconds INTEGER,
          water_used_liters REAL,
          moisture_before REAL,
          moisture_after REAL,
          trigger TEXT NOT NULL DEFAULT 'telemetry',
          pump_status BOOLEAN NOT NULL DEFAULT TRUE
        );
        CREATE INDEX IF NOT EXISTS irrigation_events_device_time_idx
          ON irrigation_events (device_id, started_at DESC);
        CREATE TABLE IF NOT EXISTS device_control (
          device_id TEXT PRIMARY KEY,
          mode TEXT NOT NULL DEFAULT 'auto',
          thresholds JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      const res = await this.pool.query(
        `SELECT * FROM irrigation_events ORDER BY started_at DESC LIMIT 200`
      );
      this.events = res.rows.map((r) => ({
        id: String(r.id),
        device_id: String(r.device_id),
        zone_id: Number(r.zone_id),
        started_at: new Date(r.started_at).toISOString(),
        ended_at: r.ended_at ? new Date(r.ended_at).toISOString() : null,
        duration_seconds: r.duration_seconds ?? null,
        water_used_liters: r.water_used_liters ?? null,
        moisture_before: r.moisture_before ?? null,
        moisture_after: r.moisture_after ?? null,
        trigger: (r.trigger ?? "telemetry") as PumpTrigger,
        pump_status: r.ended_at ? false : true,
      }));
      const ctrl = await this.pool.query(`SELECT * FROM device_control`);
      for (const row of ctrl.rows) {
        this.controlByDevice.set(String(row.device_id), {
          device_id: String(row.device_id),
          mode: (row.mode === "manual" ? "manual" : "auto") as SystemMode,
          zones: this.normalizeZones(row.thresholds as Record<string, { min?: number; max?: number; crop?: string }> | null),
          updated_at: new Date(row.updated_at).toISOString(),
        });
      }
      this.ready = true;
    } catch (error) {
      console.error("Irrigation persistence unavailable; using in-memory store.", error);
      await this.pool.end().catch(() => undefined);
      this.pool = null;
    }
  }

  getControl(deviceId: string): DeviceControlState {
    const existing = this.controlByDevice.get(deviceId);
    if (existing) return existing;
    const fresh: DeviceControlState = {
      device_id: deviceId,
      mode: "auto",
      zones: this.normalizeZones(null),
      updated_at: new Date().toISOString(),
    };
    this.controlByDevice.set(deviceId, fresh);
    return fresh;
  }

  async setMode(deviceId: string, mode: SystemMode): Promise<DeviceControlState> {
    const control = this.getControl(deviceId);
    control.mode = mode;
    control.updated_at = new Date().toISOString();
    await this.persistControl(control);
    return control;
  }

  async setZoneSettings(deviceId: string, zoneId: number, patch: Partial<ZoneSettings>): Promise<ZoneSettings> {
    const control = this.getControl(deviceId);
    const zone = control.zones.find((z) => z.zone_id === zoneId);
    if (!zone) throw new Error(`Unknown zone ${zoneId}`);
    if (patch.crop !== undefined) zone.crop = patch.crop.slice(0, 40) || zone.crop;
    if (patch.moisture_min !== undefined) zone.moisture_min = patch.moisture_min;
    if (patch.moisture_max !== undefined) zone.moisture_max = patch.moisture_max;
    if (zone.moisture_min >= zone.moisture_max) throw new Error("moisture_min must be below moisture_max");
    control.updated_at = new Date().toISOString();
    await this.persistControl(control);
    return zone;
  }

  /** Track pump transitions seen in telemetry. Returns events created/closed. */
  handleTelemetry(current: TelemetryPayload, previous: TelemetryPayload | null): { opened: IrrigationEvent[]; closed: IrrigationEvent[] } {
    const opened: IrrigationEvent[] = [];
    const closed: IrrigationEvent[] = [];
    const now = current.timestamp ?? new Date().toISOString();
    const flowPerPump = this.flowPerActivePump(current);
    this.ensureZones(current.device_id, current.zones.map((z) => z.zone_id));

    for (const zone of current.zones) {
      const prevZone = previous?.zones.find((z) => z.zone_id === zone.zone_id);
      const running = this.isZoneRunning(current.device_id, zone.zone_id);
      // An open event means the pump is considered running (covers synthetic
      // simulator emits where manualPump already recorded the transition).
      const wasOn = prevZone ? prevZone.pump_status : running;
      if (!wasOn && zone.pump_status && !running) {
        const evt: IrrigationEvent = {
          id: randomUUID(),
          device_id: current.device_id,
          zone_id: zone.zone_id,
          started_at: now,
          ended_at: null,
          duration_seconds: null,
          water_used_liters: null,
          moisture_before: zone.soil_moisture,
          moisture_after: null,
          trigger: "telemetry",
          pump_status: true,
        };
        this.events.unshift(evt);
        opened.push(evt);
        void this.persistEvent(evt);
      } else if (wasOn && !zone.pump_status) {
        const open = this.findOpenEvent(current.device_id, zone.zone_id);
        if (open) {
          open.ended_at = now;
          open.duration_seconds = Math.max(
            0,
            Math.round((new Date(now).getTime() - new Date(open.started_at).getTime()) / 1000)
          );
          // The closing zone just stopped, so it shared flow with the pumps
          // still on plus itself.
          const concurrent = current.zones.filter((z) => z.pump_status).length + 1;
          open.water_used_liters = this.estimateWater(open, current, concurrent);
          open.moisture_after = zone.soil_moisture;
          open.pump_status = false;
          closed.push({ ...open });
          void this.persistEvent(open);
        }
      } else if (zone.pump_status) {
        // Attribute ongoing water usage so stats stay live even before pump stops.
        const open = this.findOpenEvent(current.device_id, zone.zone_id);
        if (open && flowPerPump > 0) {
          open.water_used_liters = this.estimateWater(
            open,
            current,
            Math.max(current.zones.filter((z) => z.pump_status).length, 1)
          );
        }
      }
    }

    // Auto-stop safety: close events running longer than the pump limit.
    for (const open of this.events.filter((e) => e.device_id === current.device_id && !e.ended_at)) {
      const ageMin = (Date.now() - new Date(open.started_at).getTime()) / 60000;
      if (ageMin > this.maxPumpMinutes) {
        open.ended_at = now;
        open.duration_seconds = Math.round(ageMin * 60);
        open.water_used_liters = this.estimateWater(
          open,
          current,
          Math.max(current.zones.filter((z) => z.pump_status).length, 1)
        );
        open.pump_status = false;
        closed.push({ ...open });
        void this.persistEvent(open);
      }
    }

    if (this.events.length > 500) this.events.length = 500;
    return { opened, closed };
  }

  /** Manual/auto pump override. Creates/closes events directly. */
  manualPump(
    deviceId: string,
    zoneId: number,
    turnOn: boolean,
    moistureNow: number | null,
    flowRate: number,
    trigger: PumpTrigger = "manual"
  ): { event: IrrigationEvent | null; already: boolean } {
    const running = this.isZoneRunning(deviceId, zoneId);
    if (running === turnOn) return { event: null, already: true };
    if (trigger === "manual") {
      this.manualHoldUntil.set(`${deviceId}:${zoneId}`, Date.now() + IrrigationService.MANUAL_HOLD_MS);
    }
    const now = new Date().toISOString();
    if (turnOn) {
      const evt: IrrigationEvent = {
        id: randomUUID(),
        device_id: deviceId,
        zone_id: zoneId,
        started_at: now,
        ended_at: null,
        duration_seconds: null,
        water_used_liters: 0,
        moisture_before: moistureNow,
        moisture_after: null,
        trigger,
        pump_status: true,
      };
      this.events.unshift(evt);
      void this.persistEvent(evt);
      return { event: evt, already: false };
    }
    const open = this.findOpenEvent(deviceId, zoneId);
    if (open) {
      open.ended_at = now;
      open.duration_seconds = Math.max(
        0,
        Math.round((new Date(now).getTime() - new Date(open.started_at).getTime()) / 1000)
      );
      // Share the measured flow across the pumps that were running together.
      const concurrent =
        this.events.filter((e) => e.device_id === deviceId && !e.ended_at).length + 1;
      open.water_used_liters =
        Math.round(
          (((open.duration_seconds / 60) * Math.max(flowRate, 0)) / Math.max(concurrent, 1) + Number.EPSILON) * 10
        ) / 10;
      open.moisture_after = moistureNow;
      open.pump_status = false;
      void this.persistEvent(open);
      return { event: { ...open }, already: false };
    }
    return { event: null, already: true };
  }

  /**
   * Automatic regulation for devices in auto mode. Starts pumps for zones
   * below their dry threshold and stops pumps for saturated zones, subject
   * to the same tank/rain guards as manual commands. Returns actions taken.
   */
  autoRegulate(
    current: TelemetryPayload,
    control: DeviceControlState
  ): Array<{ zone_id: number; action: "on" | "off"; moisture: number }> {
    if (control.mode !== "auto") return [];
    const actions: Array<{ zone_id: number; action: "on" | "off"; moisture: number }> = [];
    const tankOk = current.system.water_level >= 15;
    for (const zone of current.zones) {
      // Respect recent manual overrides so auto and manual never fight.
      if ((this.manualHoldUntil.get(`${current.device_id}:${zone.zone_id}`) ?? 0) > Date.now()) continue;
      const cfg = control.zones.find((z) => z.zone_id === zone.zone_id);
      const min = cfg?.moisture_min ?? 30;
      const max = cfg?.moisture_max ?? 70;
      if (!zone.pump_status && zone.soil_moisture < min && tankOk && !current.system.rain) {
        actions.push({ zone_id: zone.zone_id, action: "on", moisture: zone.soil_moisture });
      } else if (zone.pump_status && zone.soil_moisture > max) {
        actions.push({ zone_id: zone.zone_id, action: "off", moisture: zone.soil_moisture });
      }
    }
    return actions;
  }

  /** Zones with a currently open event mapped to when they started running. */
  runningSince(deviceId: string): Map<number, string> {
    const map = new Map<number, string>();
    for (const e of this.events) {
      if (e.device_id === deviceId && !e.ended_at && !map.has(e.zone_id)) {
        map.set(e.zone_id, e.started_at);
      }
    }
    return map;
  }

  getHistory(deviceId: string, opts: { zoneId?: number; trigger?: PumpTrigger; limit?: number }): IrrigationEvent[] {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    return this.events
      .filter(
        (e) =>
          e.device_id === deviceId &&
          (opts.zoneId === undefined || e.zone_id === opts.zoneId) &&
          (opts.trigger === undefined || e.trigger === opts.trigger)
      )
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  getStats(deviceId: string): {
    today_liters: number;
    total_liters: number;
    total_events: number;
    active_zones: number;
    per_zone: Array<{ zone_id: number; liters: number; events: number }>;
  } {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const mine = this.events.filter((e) => e.device_id === deviceId);
    const today = mine.filter((e) => new Date(e.started_at) >= dayStart);
    const sum = (list: IrrigationEvent[]) =>
      Math.round(list.reduce((t, e) => t + (e.water_used_liters ?? 0), 0) * 10) / 10;
    const zoneIds = [...new Set(mine.map((e) => e.zone_id))].sort();
    return {
      today_liters: sum(today),
      total_liters: sum(mine),
      total_events: mine.length,
      active_zones: mine.filter((e) => !e.ended_at).length,
      per_zone: zoneIds.map((z) => ({
        zone_id: z,
        liters: sum(mine.filter((e) => e.zone_id === z)),
        events: mine.filter((e) => e.zone_id === z).length,
      })),
    };
  }

  toCsv(events: IrrigationEvent[]): string {
    const header = "id,device_id,zone_id,started_at,ended_at,duration_seconds,water_used_liters,moisture_before,moisture_after,trigger";
    const cell = (value: unknown): string => {
      if (value === null || value === undefined) return "";
      // Quote fields and neutralise spreadsheet formula prefixes.
      const text = String(value).replace(/^([=+\-@])/, "'$1").replace(/"/g, '""');
      return /[",\n]/.test(text) ? `"${text}"` : text;
    };
    const rows = events.map((e) =>
      [e.id, e.device_id, e.zone_id, e.started_at, e.ended_at, e.duration_seconds, e.water_used_liters, e.moisture_before, e.moisture_after, e.trigger].map(cell).join(",")
    );
    return [header, ...rows].join("\n") + "\n";
  }

  async close(): Promise<void> {
    await this.pool?.end().catch(() => undefined);
  }

  /** Track zones the device reports even if they have no configured defaults yet. */
  private ensureZones(deviceId: string, zoneIds: number[]): void {
    const control = this.getControl(deviceId);
    let added = false;
    for (const id of zoneIds) {
      if (!control.zones.some((z) => z.zone_id === id)) {
        control.zones.push({ zone_id: id, crop: DEFAULT_CROPS[id] ?? `Zone ${id}`, moisture_min: 30, moisture_max: 70 });
        added = true;
      }
    }
    if (added) {
      control.zones.sort((a, b) => a.zone_id - b.zone_id);
      control.updated_at = new Date().toISOString();
      void this.persistControl(control);
    }
  }

  private isZoneRunning(deviceId: string, zoneId: number): boolean {
    return this.events.some((e) => e.device_id === deviceId && e.zone_id === zoneId && !e.ended_at);
  }

  private findOpenEvent(deviceId: string, zoneId: number): IrrigationEvent | undefined {
    return this.events.find((e) => e.device_id === deviceId && e.zone_id === zoneId && !e.ended_at);
  }

  private flowPerActivePump(payload: TelemetryPayload): number {
    const active = payload.zones.filter((z) => z.pump_status).length;
    if (!active) return 0;
    return payload.system.flow_rate / active;
  }

  private estimateWater(open: IrrigationEvent, current: TelemetryPayload, concurrent = 1): number {
    const end = current.timestamp ?? new Date().toISOString();
    const seconds = Math.max(0, (new Date(end).getTime() - new Date(open.started_at).getTime()) / 1000);
    const liters = (seconds / 60) * Math.max(current.system.flow_rate, 0);
    return Math.round(((liters / Math.max(concurrent, 1) + Number.EPSILON) as number) * 10) / 10;
  }

  private normalizeZones(saved: Record<string, { min?: number; max?: number; crop?: string }> | null): ZoneSettings[] {
    const ids = [1, 2, 3];
    return ids.map((id) => ({
      zone_id: id,
      crop: saved?.[String(id)]?.crop || DEFAULT_CROPS[id] || `Zone ${id}`,
      moisture_min: saved?.[String(id)]?.min ?? 30,
      moisture_max: saved?.[String(id)]?.max ?? 70,
    }));
  }

  private async persistEvent(evt: IrrigationEvent): Promise<void> {
    if (!this.pool || !this.ready) return;
    try {
      await this.pool.query(
        `INSERT INTO irrigation_events (id, device_id, zone_id, started_at, ended_at, duration_seconds, water_used_liters, moisture_before, moisture_after, trigger, pump_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET ended_at=EXCLUDED.ended_at, duration_seconds=EXCLUDED.duration_seconds, water_used_liters=EXCLUDED.water_used_liters, moisture_after=EXCLUDED.moisture_after, pump_status=EXCLUDED.pump_status`,
        [evt.id, evt.device_id, evt.zone_id, evt.started_at, evt.ended_at, evt.duration_seconds, evt.water_used_liters, evt.moisture_before, evt.moisture_after, evt.trigger, evt.ended_at ? false : true]
      );
    } catch (error) {
      console.error("Irrigation persistence failed", error);
    }
  }

  private async persistControl(control: DeviceControlState): Promise<void> {
    if (!this.pool || !this.ready) return;
    try {
      const thresholds: Record<string, { min: number; max: number; crop: string }> = {};
      for (const z of control.zones) thresholds[String(z.zone_id)] = { min: z.moisture_min, max: z.moisture_max, crop: z.crop };
      await this.pool.query(
        `INSERT INTO device_control (device_id, mode, thresholds, updated_at) VALUES ($1,$2,$3,$4)
         ON CONFLICT (device_id) DO UPDATE SET mode=EXCLUDED.mode, thresholds=EXCLUDED.thresholds, updated_at=EXCLUDED.updated_at`,
        [control.device_id, control.mode, JSON.stringify(thresholds), control.updated_at]
      );
    } catch (error) {
      console.error("Control persistence failed", error);
    }
  }
}
