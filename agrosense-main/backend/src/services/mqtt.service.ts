import { randomUUID } from "crypto";
import mqtt, { MqttClient } from "mqtt";
import { z } from "zod";
import { env } from "../config/env";
import { TelemetryPayload } from "../types/telemetry";
import { telemetrySchema } from "../validation/telemetry.schema";
import { TelemetryStore } from "./telemetry.store";

type TelemetryListener = (payload: TelemetryPayload, previous: TelemetryPayload | null) => void;

export const pumpCommandSchema = z.object({
  request_id: z.string().min(1),
  zone_id: z.number().int().positive(),
  action: z.enum(["on", "off"]),
  trigger: z.enum(["manual", "auto"]).default("manual"),
  issued_at: z.string().datetime({ offset: true }),
});

export type PumpCommand = z.infer<typeof pumpCommandSchema>;

const ackSchema = z.object({
  request_id: z.string().min(1),
  zone_id: z.number().int().positive(),
  action: z.enum(["on", "off"]),
  ok: z.boolean(),
  message: z.string().max(280).optional(),
  received_at: z.string().datetime({ offset: true }).optional(),
});

export type CommandAck = z.infer<typeof ackSchema> & { device_id: string };

export type PendingCommand = {
  request_id: string;
  device_id: string;
  zone_id: number;
  action: "on" | "off";
  trigger: "manual" | "auto";
  issued_at: string;
  status: "sent" | "acked" | "timeout" | "failed";
  ack: CommandAck | null;
};

type AckListener = (ack: CommandAck) => void;

const ACK_TIMEOUT_MS = 10_000;

export class MqttService {
  private client: MqttClient | null = null;
  private readonly telemetryListeners: TelemetryListener[] = [];
  private readonly ackListeners: AckListener[] = [];
  private readonly pending = new Map<string, PendingCommand>();

  constructor(private readonly store: TelemetryStore) {}

  onTelemetry(listener: TelemetryListener): void {
    this.telemetryListeners.push(listener);
  }

  onAck(listener: AckListener): void {
    this.ackListeners.push(listener);
  }

  emitForTesting(payload: TelemetryPayload, previous: TelemetryPayload | null = null): void {
    this.telemetryListeners.forEach((listener) => listener(payload, previous));
  }

  status(): { enabled: boolean; connected: boolean; pending: number } {
    return {
      enabled: env.MQTT_ENABLED,
      connected: this.client?.connected ?? false,
      pending: [...this.pending.values()].filter((p) => p.status === "sent").length,
    };
  }

  getPending(deviceId: string): PendingCommand[] {
    return [...this.pending.values()]
      .filter((p) => p.device_id === deviceId)
      .sort((a, b) => +new Date(b.issued_at) - +new Date(a.issued_at))
      .slice(0, 20);
  }

  /** Publish a pump command to the device. Always resolves; delivery reports simulator vs broker. */
  publishCommand(
    deviceId: string,
    zoneId: number,
    action: "on" | "off",
    trigger: "manual" | "auto" = "manual"
  ): { request_id: string; delivery: "sent" | "disabled" | "offline" } {
    const request_id = randomUUID();
    const command: PumpCommand = {
      request_id,
      zone_id: zoneId,
      action,
      trigger,
      issued_at: new Date().toISOString(),
    };

    if (!env.MQTT_ENABLED || !this.client || !this.client.connected) {
      return { request_id, delivery: env.MQTT_ENABLED ? "offline" : "disabled" };
    }

    const entry: PendingCommand = {
      request_id,
      device_id: deviceId,
      zone_id: zoneId,
      action,
      trigger,
      issued_at: command.issued_at,
      status: "sent",
      ack: null,
    };
    // Prune settled entries older than 5 minutes so the map can't grow forever.
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [id, cmd] of this.pending) {
      if (cmd.status !== "sent" && new Date(cmd.issued_at).getTime() < cutoff) {
        this.pending.delete(id);
      }
    }
    this.pending.set(request_id, entry);
    setTimeout(() => {
      const current = this.pending.get(request_id);
      if (current && current.status === "sent") current.status = "timeout";
    }, ACK_TIMEOUT_MS).unref?.();

    this.client.publish(
      `${env.MQTT_TOPIC_PREFIX}/${deviceId}/commands`,
      JSON.stringify(command),
      { qos: 1 },
      (error) => {
        if (error) {
          const current = this.pending.get(request_id);
          if (current) current.status = "failed";
          console.error("MQTT command publish failed", error.message);
        }
      }
    );
    return { request_id, delivery: "sent" };
  }

  start(): void {
    if (!env.MQTT_ENABLED) {
      console.log("MQTT disabled; using HTTP telemetry endpoint and seeded data.");
      return;
    }

    const telemetryTopic = `${env.MQTT_TOPIC_PREFIX}/+/telemetry`;
    const ackTopic = `${env.MQTT_TOPIC_PREFIX}/+/commands/ack`;
    this.client = mqtt.connect(env.MQTT_URL, {
      username: env.MQTT_USERNAME || undefined,
      password: env.MQTT_PASSWORD || undefined,
      reconnectPeriod: 5_000,
    });

    this.client.on("connect", () => {
      console.log(`MQTT connected: ${env.MQTT_URL}`);
      this.client?.subscribe([telemetryTopic, ackTopic], (error) => {
        if (error) console.error("MQTT subscription failed", error);
        else console.log(`MQTT subscribed: ${telemetryTopic}, ${ackTopic}`);
      });
    });

    this.client.on("reconnect", () => console.log("MQTT reconnecting..."));
    this.client.on("error", (error) => console.error("MQTT error", error.message));
    this.client.on("message", (messageTopic, message) => this.handleMessage(messageTopic, message));
  }

  stop(): void {
    this.client?.end(true);
    this.client = null;
  }

  private handleMessage(topic: string, message: Buffer): void {
    const parts = topic.split("/");
    if (parts.length === 4 && parts[0] === env.MQTT_TOPIC_PREFIX && parts[2] === "commands" && parts[3] === "ack") {
      this.handleAck(parts[1], message);
      return;
    }
    this.handleTelemetry(topic, parts, message);
  }

  private handleAck(topicDeviceId: string, message: Buffer): void {
    try {
      const parsed = ackSchema.parse(JSON.parse(message.toString()));
      const ack: CommandAck = { ...parsed, device_id: topicDeviceId };
      const entry = this.pending.get(parsed.request_id);
      if (entry) {
        entry.status = "acked";
        entry.ack = ack;
      }
      this.ackListeners.forEach((listener) => listener(ack));
      console.log(`MQTT ack ${parsed.request_id} from ${topicDeviceId}: ${parsed.ok ? "ok" : "failed"}`);
    } catch (error) {
      console.error("Invalid MQTT ack payload", error);
    }
  }

  private handleTelemetry(topic: string, parts: string[], message: Buffer): void {
    try {
      const parsed = telemetrySchema.parse(JSON.parse(message.toString()));
      const topicDeviceId =
        parts.length === 3 && parts[0] === env.MQTT_TOPIC_PREFIX && parts[2] === "telemetry" ? parts[1] : null;
      if (!topicDeviceId || topicDeviceId !== parsed.device_id) {
        console.error("Rejected MQTT telemetry: topic and payload device IDs do not match");
        return;
      }
      const previous = this.store.ingest(parsed);
      this.telemetryListeners.forEach((listener) => listener(parsed, previous));
    } catch (error) {
      console.error("Invalid MQTT telemetry payload", error);
      void topic;
    }
  }
}
