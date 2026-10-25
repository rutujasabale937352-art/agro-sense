import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IrrigationService } from "../src/services/irrigation.service.js";
import type { TelemetryPayload } from "../src/types/telemetry.js";

const base: TelemetryPayload = {
  device_id: "TEST01",
  timestamp: new Date().toISOString(),
  system: { temperature: 28, humidity: 60, water_level: 80, rain: false, flow_rate: 2 },
  zones: [
    { zone_id: 1, soil_moisture: 30, pump_status: false },
    { zone_id: 2, soil_moisture: 55, pump_status: false },
  ],
};

describe("IrrigationService", () => {
  it("opens an event when a pump turns on and closes it with water estimate", () => {
    const svc = new IrrigationService();
    const on: TelemetryPayload = {
      ...base,
      timestamp: new Date().toISOString(),
      zones: [
        { zone_id: 1, soil_moisture: 24, pump_status: true },
        { zone_id: 2, soil_moisture: 55, pump_status: false },
      ],
    };
    const opened = svc.handleTelemetry(on, null);
    assert.equal(opened.opened.length, 1);
    assert.equal(opened.opened[0].moisture_before, 24);

    const later = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const off: TelemetryPayload = {
      ...base,
      timestamp: later,
      system: { ...base.system, flow_rate: 2 },
      zones: [
        { zone_id: 1, soil_moisture: 45, pump_status: false },
        { zone_id: 2, soil_moisture: 55, pump_status: false },
      ],
    };
    const closed = svc.handleTelemetry(off, on);
    assert.equal(closed.closed.length, 1);
    assert.equal(closed.closed[0].duration_seconds, 600);
    assert.equal(closed.closed[0].moisture_after, 45);
    assert.ok((closed.closed[0].water_used_liters ?? 0) > 0);
  });

  it("manualPump is idempotent when already in the requested state", () => {
    const svc = new IrrigationService();
    const first = svc.manualPump("TEST01", 1, true, 20, 2);
    assert.equal(first.already, false);
    const second = svc.manualPump("TEST01", 1, true, 20, 2);
    assert.equal(second.already, true);
    const stop = svc.manualPump("TEST01", 1, false, 30, 2);
    assert.equal(stop.already, false);
    assert.ok(stop.event?.ended_at);
  });

  it("auto-closes runaway events past the pump limit", () => {
    const svc = new IrrigationService(0);
    svc.manualPump("TEST01", 1, true, 20, 2);
    const res = svc.handleTelemetry({ ...base, timestamp: new Date().toISOString() }, null);
    assert.ok(res.closed.length >= 1);
    assert.ok(res.closed[0].ended_at);
  });

  it("autoRegulate starts dry zones and stops saturated ones in auto mode", () => {
    const svc = new IrrigationService();
    const control = svc.getControl("TEST01");
    const dry: TelemetryPayload = {
      ...base,
      system: { ...base.system, water_level: 70, rain: false },
      zones: [{ zone_id: 1, soil_moisture: 10, pump_status: false }],
    };
    assert.deepEqual(
      svc.autoRegulate(dry, control).map((a) => [a.zone_id, a.action]),
      [[1, "on"]]
    );
    const wet: TelemetryPayload = {
      ...base,
      system: { ...base.system, water_level: 70, rain: false },
      zones: [{ zone_id: 1, soil_moisture: 90, pump_status: true }],
    };
    assert.deepEqual(
      svc.autoRegulate(wet, control).map((a) => [a.zone_id, a.action]),
      [[1, "off"]]
    );
    const rainy: TelemetryPayload = {
      ...dry,
      system: { ...dry.system, rain: true },
    };
    assert.equal(svc.autoRegulate(rainy, control).length, 0);
    const manual = svc.getControl("TEST02");
    manual.mode = "manual";
    assert.equal(svc.autoRegulate(dry, manual).length, 0);
  });

  it("rejects invalid threshold ranges", async () => {
    const svc = new IrrigationService();
    await assert.rejects(() => svc.setZoneSettings("TEST01", 1, { moisture_min: 80, moisture_max: 30 }));
  });
});
