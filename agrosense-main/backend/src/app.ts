import cors from "cors";
import express from "express";
import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./config/env";
import { errorHandler } from "./middleware/error-handler";
import { createApiRouter } from "./routes/api";
import { AlertService } from "./services/alert.service";
import { IrrigationService } from "./services/irrigation.service";
import { MqttService } from "./services/mqtt.service";
import { TelemetryStore } from "./services/telemetry.store";

export function createApp() {
  const app = express();
  const httpServer = new HttpServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN },
  });
  const store = new TelemetryStore();
  const irrigation = new IrrigationService();
  const alertService = new AlertService();
  const mqttService = new MqttService(store);

  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.use(express.json());

  app.use("/api/v1", createApiRouter(store, mqttService, irrigation, alertService));
  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);

  const summarize = (deviceId = "AGROSENSE01") => {
    const base = store.getSummary(deviceId);
    const stats = irrigation.getStats(deviceId);
    const { unread } = alertService.list(deviceId, { limit: 1 });
    return {
      ...base,
      water_usage_liters: stats.today_liters,
      alerts_unread: unread,
      mode: irrigation.getControl(deviceId).mode,
    };
  };

  io.on("connection", (socket) => {
    socket.emit("dashboard:summary", summarize());
    socket.emit("alerts:update", alertService.list("AGROSENSE01", { limit: 20 }));
  });

  // Single fan-out point for BOTH HTTP simulator and MQTT telemetry.
  mqttService.onTelemetry((payload, previous) => {
    irrigation.handleTelemetry(payload, previous);
    const control = irrigation.getControl(payload.device_id);

    // Automatic regulation: start dry zones, stop saturated ones (auto mode only,
    // honouring tank/rain guards and recent manual overrides).
    let autoActions: Array<{ zone_id: number; action: "on" | "off"; moisture: number }> = [];
    try {
      autoActions = irrigation.autoRegulate(payload, control);
    } catch (error) {
      console.error("Auto regulation failed", error);
    }
    let livePayload = payload;
    for (const action of autoActions) {
      const zone = livePayload.zones.find((z) => z.zone_id === action.zone_id);
      irrigation.manualPump(
        payload.device_id,
        action.zone_id,
        action.action === "on",
        zone?.soil_moisture ?? null,
        livePayload.system.flow_rate,
        "auto"
      );
      const switched = store.setPumpState(payload.device_id, action.zone_id, action.action === "on");
      if (switched) livePayload = switched.payload;
      mqttService.publishCommand(payload.device_id, action.zone_id, action.action, "auto");
    }

    const thresholds = new Map(control.zones.map((z) => [z.zone_id, z.moisture_min] as const));
    // Flow anomalies only count for pumps running a while — fresh starts read ~0.
    const matured = new Set<number>();
    for (const [zoneId, startedAt] of irrigation.runningSince(payload.device_id)) {
      if (Date.now() - new Date(startedAt).getTime() > 90 * 1000) matured.add(zoneId);
    }
    const freshAlerts = alertService.evaluate(livePayload, thresholds, 25, matured);
    io.emit("telemetry:update", livePayload);
    io.emit("dashboard:summary", summarize(payload.device_id));
    if (freshAlerts.length || autoActions.length) {
      io.emit("alerts:update", alertService.list(payload.device_id, { limit: 20 }));
    }
    const closedOrOpened = irrigation.getHistory(payload.device_id, { limit: 5 });
    io.emit("irrigation:update", { device_id: payload.device_id, recent: closedOrOpened });
  });

  mqttService.onAck((ack) => {
    io.emit("command:update", ack);
  });

  return { app, httpServer, io, mqttService, store, irrigation, alertService, summarize };
}
