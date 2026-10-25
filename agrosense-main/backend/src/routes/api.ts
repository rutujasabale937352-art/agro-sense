import { Router } from "express";
import { buildPlantAnalysis } from "../services/analysis.service";
import type { AlertService } from "../services/alert.service";
import type { IrrigationService } from "../services/irrigation.service";
import type { MqttService } from "../services/mqtt.service";
import { TelemetryStore } from "../services/telemetry.store";
import { telemetrySchema } from "../validation/telemetry.schema";
import {
  historyQuerySchema,
  modeSchema,
  pumpActionSchema,
  zoneSettingsSchema,
} from "../validation/control.schema";
import type { ZoneInfo } from "../types/irrigation";

export function createApiRouter(
  store: TelemetryStore,
  mqttService: MqttService,
  irrigation: IrrigationService,
  alerts: AlertService
): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "agrosense-backend", uptime_seconds: Math.round(process.uptime()) });
  });

  router.get("/ready", (_request, response) => {
    const mqtt = mqttService.status();
    response.json({
      ready: true,
      database: store.databaseStatus(),
      mqtt,
    });
  });

  router.get("/devices/:deviceId/commands/pending", (request, response) => {
    response.json({
      device_id: request.params.deviceId,
      commands: mqttService.getPending(request.params.deviceId),
      mqtt: mqttService.status(),
    });
  });

  router.get("/dashboard/summary", (request, response) => {
    const deviceId = typeof request.query.device_id === "string" ? request.query.device_id : "AGROSENSE01";
    const base = store.getSummary(deviceId);
    const stats = irrigation.getStats(deviceId);
    const { unread } = alerts.list(deviceId, { limit: 1 });
    response.json({
      ...base,
      water_usage_liters: stats.today_liters,
      alerts_unread: unread,
      mode: irrigation.getControl(deviceId).mode,
    });
  });

  router.get("/devices/:deviceId/latest", (request, response) => {
    const payload = store.getLatest(request.params.deviceId);
    if (!payload) {
      response.status(404).json({ error: "No telemetry found for device" });
      return;
    }
    response.json(payload);
  });

  router.post("/devices/:deviceId/telemetry", (request, response) => {
    if (
      request.body?.device_id !== undefined &&
      request.body.device_id !== request.params.deviceId
    ) {
      response.status(400).json({ error: "Body device_id does not match URL device ID" });
      return;
    }
    const parsed = telemetrySchema.safeParse({
      ...request.body,
      device_id: request.params.deviceId,
    });

    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid telemetry payload",
        details: parsed.error.flatten(),
      });
      return;
    }

    const previous = store.ingest(parsed.data);
    mqttService.emitForTesting(parsed.data, previous);
    response.status(202).json({ accepted: true, device_id: parsed.data.device_id });
  });

  // ---- Zones & control ----
  router.get("/zones", (request, response) => {
    const deviceId = typeof request.query.device_id === "string" ? request.query.device_id : "AGROSENSE01";
    const latest = store.getLatest(deviceId);
    const control = irrigation.getControl(deviceId);
    const zones: ZoneInfo[] = control.zones.map((cfg) => {
      const live = latest?.zones.find((z) => z.zone_id === cfg.zone_id);
      const moisture = live?.soil_moisture ?? null;
      return {
        ...cfg,
        soil_moisture: moisture,
        pump_status: live?.pump_status ?? false,
        health: moisture === null ? "unknown" : moisture < cfg.moisture_min ? "dry" : moisture > cfg.moisture_max ? "saturated" : "healthy",
      };
    });
    response.json({ device_id: deviceId, mode: control.mode, zones });
  });

  router.put("/devices/:deviceId/zones/:zoneId/settings", async (request, response) => {
    const zoneId = Number(request.params.zoneId);
    if (!Number.isInteger(zoneId) || zoneId <= 0) {
      response.status(400).json({ error: "Invalid zone id" });
      return;
    }
    const parsed = zoneSettingsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid zone settings", details: parsed.error.flatten() });
      return;
    }
    if (Object.keys(parsed.data).length === 0) {
      response.status(400).json({ error: "No settings to update" });
      return;
    }
    try {
      const zone = await irrigation.setZoneSettings(request.params.deviceId, zoneId, parsed.data);
      response.json({ device_id: request.params.deviceId, zone });
    } catch (err) {
      const status = err instanceof Error && err.message.startsWith("Unknown zone") ? 404 : 400;
      response.status(status).json({ error: err instanceof Error ? err.message : "Update failed" });
    }
  });

  router.post("/devices/:deviceId/zones/:zoneId/pump", (request, response) => {
    const deviceId = request.params.deviceId;
    const zoneId = Number(request.params.zoneId);
    if (!Number.isInteger(zoneId) || zoneId <= 0) {
      response.status(400).json({ error: "Invalid zone id" });
      return;
    }
    const parsed = pumpActionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid pump action", details: parsed.error.flatten() });
      return;
    }
    const latest = store.getLatest(deviceId);
    if (!latest) {
      response.status(404).json({ error: "No telemetry found for device" });
      return;
    }
    const zone = latest.zones.find((z) => z.zone_id === zoneId);
    if (!zone) {
      response.status(404).json({ error: `Zone ${zoneId} not found in latest telemetry` });
      return;
    }
    const turnOn = parsed.data.action === "on";
    const control = irrigation.getControl(deviceId);

    // Safety interlocks
    if (turnOn && latest.system.water_level < 15) {
      alerts.pushSystem(deviceId, `Blocked pump ON for zone ${zoneId}: tank critically low (${latest.system.water_level}%).`, "critical");
      response.status(409).json({ error: "Blocked by safety interlock: tank critically low", water_level: latest.system.water_level });
      return;
    }
    if (turnOn && control.mode === "auto" && latest.system.rain) {
      response.status(409).json({ error: "Blocked in auto mode while raining. Switch to manual to override." });
      return;
    }

    const { already } = irrigation.manualPump(
      deviceId,
      zoneId,
      turnOn,
      zone.soil_moisture,
      latest.system.flow_rate,
      parsed.data.trigger
    );
    if (already) {
      response.json({
        device_id: deviceId,
        zone_id: zoneId,
        pump_status: turnOn,
        already: true,
        trigger: parsed.data.trigger,
      });
      return;
    }
    const switched = store.setPumpState(deviceId, zoneId, turnOn);
    // Forward to hardware when a broker is configured; simulator path still updates instantly.
    const command = mqttService.publishCommand(deviceId, zoneId, parsed.data.action, parsed.data.trigger);
    if (switched) {
      mqttService.emitForTesting(switched.payload, switched.previous);
    }
    response.json({
      device_id: deviceId,
      zone_id: zoneId,
      pump_status: turnOn,
      trigger: parsed.data.trigger,
      warning: turnOn && latest.system.rain ? "Rain detected — irrigation during rain is wasteful." : undefined,
      command: {
        request_id: command.request_id,
        delivery: command.delivery,
        ack: command.delivery === "sent" ? "pending" : "n/a",
      },
    });
  });

  router.get("/devices/:deviceId/mode", (request, response) => {
    response.json(irrigation.getControl(request.params.deviceId));
  });

  router.put("/devices/:deviceId/mode", async (request, response) => {
    const parsed = modeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid mode", details: parsed.error.flatten() });
      return;
    }
    response.json(await irrigation.setMode(request.params.deviceId, parsed.data.mode));
  });

  // ---- Irrigation history ----
  router.get("/irrigation/history", (request, response) => {
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const { device_id, zone_id, trigger, limit } = parsed.data;
    response.json({
      device_id,
      events: irrigation.getHistory(device_id, { zoneId: zone_id, trigger, limit }),
      stats: irrigation.getStats(device_id),
    });
  });

  router.get("/irrigation/history.csv", (request, response) => {
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const { device_id, zone_id, trigger, limit } = parsed.data;
    const events = irrigation.getHistory(device_id, { zoneId: zone_id, trigger, limit });
    const safeName = device_id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "device";
    response.header("content-type", "text/csv");
    response.header("content-disposition", `attachment; filename="irrigation-${safeName}.csv"`);
    response.send(irrigation.toCsv(events));
  });

  router.get("/irrigation/stats", (request, response) => {
    const deviceId = typeof request.query.device_id === "string" ? request.query.device_id : "AGROSENSE01";
    response.json({ device_id: deviceId, ...irrigation.getStats(deviceId) });
  });

  // ---- Alerts ----
  router.get("/alerts", (request, response) => {
    const deviceId = typeof request.query.device_id === "string" ? request.query.device_id : "AGROSENSE01";
    const unreadOnly = request.query.unread_only === "true" || request.query.unread_only === "1";
    const rawLimit = Number(request.query.limit);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) && request.query.limit !== undefined ? rawLimit : 50, 1), 200);
    alerts.checkOffline(deviceId, store.getLatest(deviceId)?.timestamp ?? null);
    response.json({ device_id: deviceId, ...alerts.list(deviceId, { unreadOnly, limit }) });
  });

  router.patch("/alerts/:id/read", async (request, response) => {
    const item = await alerts.markRead(request.params.id);
    if (!item) {
      response.status(404).json({ error: "Alert not found" });
      return;
    }
    response.json(item);
  });

  router.post("/alerts/read-all", async (request, response) => {
    const deviceId =
      typeof request.body?.device_id === "string" ? request.body.device_id : "AGROSENSE01";
    response.json({ device_id: deviceId, marked: await alerts.markAllRead(deviceId) });
  });

  // ---- Plant analysis ----
  router.get("/plants/analysis", (request, response) => {
    const deviceId = typeof request.query.device_id === "string" ? request.query.device_id : "AGROSENSE01";
    response.json(buildPlantAnalysis(deviceId, store.getLatest(deviceId), irrigation.getControl(deviceId)));
  });

  return router;
}
