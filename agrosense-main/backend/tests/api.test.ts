import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";

let base = "";
let close: () => Promise<void> = async () => {};

before(async () => {
  const app = createApp();
  await app.store.initialize();
  await app.irrigation.initialize();
  await app.alertService.initialize();
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const { port } = app.httpServer.address() as AddressInfo;
  base = `http://127.0.0.1:${port}/api/v1`;
  close = async () => {
    app.mqttService.stop();
    await app.store.close();
    await app.irrigation.close();
    await app.alertService.close();
    await new Promise<void>((resolve, reject) =>
      app.httpServer.close((e) => (e ? reject(e) : resolve()))
    );
  };
});

after(() => close());

const post = (path: string, body: unknown, method = "POST") =>
  fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("AgroSense API", () => {
  it("health and readiness", async () => {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.status, "ok");
    const ready = (await (await fetch(`${base}/ready`)).json()) as {
      ready: boolean;
      database: string;
      mqtt: { enabled: boolean };
    };
    assert.equal(ready.ready, true);
    assert.ok(["in-memory", "postgres"].includes(ready.database));
    assert.equal(typeof ready.mqtt.enabled, "boolean");
  });

  it("unknown routes return JSON 404", async () => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as { error: string }).error, "Not found");
  });

  it("rejects invalid telemetry with details", async () => {
    const res = await post("/devices/AGROSENSE01/telemetry", { system: {}, zones: [] });
    assert.equal(res.status, 400);
  });

  it("enforces pump safety interlocks then accepts valid commands", async () => {
    await post("/devices/AGROSENSE01/telemetry", {
      system: { temperature: 30, humidity: 60, water_level: 10, rain: false, flow_rate: 0 },
      zones: [{ zone_id: 1, soil_moisture: 20, pump_status: false }],
    });
    const blocked = await post("/devices/AGROSENSE01/zones/1/pump", { action: "on" });
    assert.equal(blocked.status, 409);

    await post("/devices/AGROSENSE01/telemetry", {
      system: { temperature: 30, humidity: 60, water_level: 70, rain: false, flow_rate: 0 },
      zones: [{ zone_id: 1, soil_moisture: 20, pump_status: false }],
    });
    // NOTE: auto mode may have already started this dry zone, in which case
    // the command is a no-op reported via `already`.
    const ok = await post("/devices/AGROSENSE01/zones/1/pump", { action: "on" });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as {
      pump_status: boolean;
      already?: boolean;
      command?: { delivery: string; ack: string };
    };
    assert.equal(body.pump_status, true);
    if (!body.already) {
      assert.equal(body.command?.delivery, "disabled");
      assert.equal(body.command?.ack, "n/a");
    }

    const bad = await post("/devices/AGROSENSE01/zones/1/pump", { action: "flood" });
    assert.equal(bad.status, 400);
  });

  it("round-trips control mode and exports history CSV", async () => {
    const mode = await (
      await fetch(`${base}/devices/AGROSENSE01/mode`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "manual" }),
      })
    ).json();
    assert.equal((mode as { mode: string }).mode, "manual");

    const csv = await fetch(`${base}/irrigation/history.csv?device_id=AGROSENSE01&limit=5`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
    const text = await csv.text();
    assert.ok(text.startsWith("id,device_id,zone_id"));
  });
});
