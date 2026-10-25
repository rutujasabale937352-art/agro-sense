import { DashboardSummary, TelemetryPayload } from "../types/telemetry";
import { Pool } from "pg";
import { env } from "../config/env";

export class TelemetryStore {
  private latestByDevice = new Map<string, TelemetryPayload>();
  private pool: Pool | null = env.DATABASE_URL ? new Pool({ connectionString: env.DATABASE_URL }) : null;
  private initialized = false;
  private pendingPayloads: TelemetryPayload[] = [];

  constructor() {
    this.pool?.on("error", (error) => console.error("PostgreSQL pool error (telemetry)", error.message));
    this.latestByDevice.set("AGROSENSE01", {
      device_id: "AGROSENSE01",
      timestamp: new Date().toISOString(),
      system: {
        temperature: 29.5,
        humidity: 64,
        water_level: 78,
        rain: false,
        flow_rate: 1.8
      },
      zones: [
        { zone_id: 1, soil_moisture: 28, pump_status: true },
        { zone_id: 2, soil_moisture: 52, pump_status: false },
        { zone_id: 3, soil_moisture: 21, pump_status: true }
      ]
    });
  }

  async initialize(): Promise<void> {
    if (!this.pool) {
      console.log("PostgreSQL disabled; using in-memory telemetry store.");
      return;
    }

    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          wifi_status TEXT NOT NULL DEFAULT 'offline',
          last_seen_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS zones (
          device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
          id INTEGER NOT NULL,
          name TEXT NOT NULL,
          crop TEXT,
          pump_status BOOLEAN NOT NULL DEFAULT FALSE,
          moisture_min REAL NOT NULL DEFAULT 30,
          moisture_max REAL NOT NULL DEFAULT 70,
          PRIMARY KEY (device_id, id)
        );
        CREATE TABLE IF NOT EXISTS sensor_readings (
          id BIGSERIAL PRIMARY KEY,
          device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
          zone_id INTEGER,
          recorded_at TIMESTAMPTZ NOT NULL,
          temperature REAL,
          humidity REAL,
          water_level REAL,
          rain BOOLEAN,
          flow_rate REAL,
          soil_moisture REAL,
          FOREIGN KEY (device_id, zone_id) REFERENCES zones(device_id, id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS sensor_readings_device_time_idx
          ON sensor_readings (device_id, recorded_at DESC);
        CREATE INDEX IF NOT EXISTS sensor_readings_zone_time_idx
          ON sensor_readings (zone_id, recorded_at DESC);
      `);
      await this.hydrate();
      this.initialized = true;
      const pendingPayloads = this.pendingPayloads.splice(0);
      pendingPayloads.forEach((payload) => void this.persist(payload));
      console.log("PostgreSQL telemetry persistence enabled.");
    } catch (error) {
      console.error("PostgreSQL unavailable; continuing with in-memory telemetry store.", error);
      await this.pool.end();
      this.pool = null;
      this.initialized = true;
      this.pendingPayloads = [];
    }
  }

  /** Store payload; returns the previous payload so callers can diff pump transitions. */
  ingest(payload: TelemetryPayload): TelemetryPayload | null {
    const previous = this.latestByDevice.get(payload.device_id) ?? null;
    let timestamp = payload.timestamp ?? new Date().toISOString();
    // Clamp device clocks running >5min ahead so durations/dedupe windows stay sane.
    if (new Date(timestamp).getTime() > Date.now() + 5 * 60 * 1000) {
      timestamp = new Date().toISOString();
    }
    const normalized = { ...payload, timestamp };
    this.latestByDevice.set(payload.device_id, normalized);
    if (this.pool && !this.initialized) {
      this.pendingPayloads.push(normalized);
      return previous;
    }
    void this.persist(normalized).catch((error) => console.error("Telemetry persistence failed", error));
    return previous;
  }

  getLatest(deviceId: string): TelemetryPayload | null {
    return this.latestByDevice.get(deviceId) ?? null;
  }

  databaseStatus(): "postgres" | "in-memory" {
    return this.pool ? "postgres" : "in-memory";
  }

  /** Simulator override: flip a zone pump state (used by manual control when no hardware). */
  setPumpState(
    deviceId: string,
    zoneId: number,
    pumpOn: boolean
  ): { payload: TelemetryPayload; previous: TelemetryPayload } | null {
    const current = this.latestByDevice.get(deviceId);
    if (!current) return null;
    const updated: TelemetryPayload = {
      ...current,
      timestamp: new Date().toISOString(),
      zones: current.zones.map((z) => (z.zone_id === zoneId ? { ...z, pump_status: pumpOn } : z)),
    };
    this.latestByDevice.set(deviceId, updated);
    void this.persist(updated).catch((error) => console.error("Telemetry persistence failed", error));
    return { payload: updated, previous: current };
  }

  getSummary(deviceId = "AGROSENSE01"): DashboardSummary {
    const latest = this.getLatest(deviceId);
    const timestamp = latest?.timestamp ? new Date(latest.timestamp) : null;
    const isOnline = timestamp !== null && Date.now() - timestamp.getTime() < 5 * 60 * 1000;

    return {
      device_id: deviceId,
      last_updated: latest?.timestamp ?? null,
      system: latest?.system ?? null,
      zones: latest?.zones ?? [],
      water_usage_liters: null,
      system_status: isOnline ? "online" : "offline"
    };
  }

  async close(): Promise<void> {
    await this.pool?.end();
  }

  private async persist(payload: TelemetryPayload): Promise<void> {
    if (!this.pool || !this.initialized) return;

    let client;
    try {
      client = await this.pool.connect();
    } catch (error) {
      console.error("Telemetry persistence failed (no DB connection)", error);
      return;
    }
    try {
      const recordedAt = payload.timestamp ?? new Date().toISOString();
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO devices (id, name, wifi_status, last_seen_at)
         VALUES ($1, $2, 'online', $3)
         ON CONFLICT (id) DO UPDATE SET wifi_status = 'online', last_seen_at = EXCLUDED.last_seen_at`,
        [payload.device_id, payload.device_id, recordedAt]
      );

      await client.query(
        `INSERT INTO sensor_readings
          (device_id, recorded_at, temperature, humidity, water_level, rain, flow_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          payload.device_id,
          recordedAt,
          payload.system.temperature,
          payload.system.humidity,
          payload.system.water_level,
          payload.system.rain,
          payload.system.flow_rate
        ]
      );

      for (const zone of payload.zones) {
        await client.query(
          `INSERT INTO zones (id, device_id, name, pump_status)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (device_id, id) DO UPDATE SET pump_status = EXCLUDED.pump_status`,
          [zone.zone_id, payload.device_id, `Zone ${zone.zone_id}`, zone.pump_status]
        );
        await client.query(
          `INSERT INTO sensor_readings (device_id, zone_id, recorded_at, soil_moisture)
           VALUES ($1, $2, $3, $4)`,
          [payload.device_id, zone.zone_id, recordedAt, zone.soil_moisture]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("Telemetry persistence failed", error);
    } finally {
      client.release();
    }
  }

  private async hydrate(): Promise<void> {
    if (!this.pool) return;

    const systemResult = await this.pool.query(`
      SELECT d.id AS device_id, r.recorded_at, r.temperature, r.humidity,
        r.water_level, r.rain, r.flow_rate
      FROM devices d
      JOIN LATERAL (
        SELECT * FROM sensor_readings
        WHERE device_id = d.id AND zone_id IS NULL
        ORDER BY recorded_at DESC LIMIT 1
      ) r ON TRUE
    `);

    for (const row of systemResult.rows) {
      const zoneResult = await this.pool.query(`
        SELECT DISTINCT ON (sr.device_id, sr.zone_id) sr.zone_id, sr.soil_moisture, z.pump_status
        FROM sensor_readings sr
        JOIN zones z ON z.device_id = sr.device_id AND z.id = sr.zone_id
        WHERE sr.device_id = $1 AND sr.zone_id IS NOT NULL
        ORDER BY sr.device_id, sr.zone_id, sr.recorded_at DESC
      `, [row.device_id]);

      this.latestByDevice.set(row.device_id, {
        device_id: row.device_id,
        timestamp: new Date(row.recorded_at).toISOString(),
        system: {
          temperature: Number(row.temperature),
          humidity: Number(row.humidity),
          water_level: Number(row.water_level),
          rain: Boolean(row.rain),
          flow_rate: Number(row.flow_rate)
        },
        zones: zoneResult.rows.map((zone) => ({
          zone_id: Number(zone.zone_id),
          soil_moisture: Number(zone.soil_moisture),
          pump_status: Boolean(zone.pump_status)
        }))
      });
    }
  }
}
