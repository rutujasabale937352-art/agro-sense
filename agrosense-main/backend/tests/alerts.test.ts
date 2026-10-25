import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AlertService } from "../src/services/alert.service.js";
import type { TelemetryPayload } from "../src/types/telemetry.js";

const payload: TelemetryPayload = {
  device_id: "TEST01",
  timestamp: new Date().toISOString(),
  system: { temperature: 29, humidity: 60, water_level: 10, rain: false, flow_rate: 0 },
  zones: [{ zone_id: 1, soil_moisture: 20, pump_status: true }],
};

describe("AlertService", () => {
  it("raises critical low-water and pump-anomaly alerts", () => {
    const svc = new AlertService();
    const created = svc.evaluate(payload, new Map([[1, 30]]));
    const types = created.map((a) => a.type);
    assert.ok(types.includes("low_water"));
    assert.ok(types.includes("pump_anomaly"));
    const lowWater = created.find((a) => a.type === "low_water");
    assert.equal(lowWater?.severity, "critical");
  });

  it("dedupes identical alerts within the window", () => {
    const svc = new AlertService();
    const first = svc.evaluate(payload, new Map([[1, 30]]));
    const second = svc.evaluate(payload, new Map([[1, 30]]));
    assert.ok(first.length > 0);
    assert.equal(second.length, 0);
  });

  it("stays quiet when everything is healthy", () => {
    const svc = new AlertService();
    const calm: TelemetryPayload = {
      ...payload,
      system: { temperature: 27, humidity: 60, water_level: 70, rain: false, flow_rate: 1.5 },
      zones: [{ zone_id: 1, soil_moisture: 50, pump_status: true }],
    };
    assert.equal(svc.evaluate(calm, new Map([[1, 30]])).length, 0);
  });
});
