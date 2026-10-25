import { env } from "@/config/env";
import type {
  AlertItem,
  DashboardSummary,
  DeviceControl,
  IrrigationEvent,
  IrrigationStats,
  PlantAnalysis,
  ZoneInfo,
} from "./types";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  try {
    const response = await fetchWithTimeout(`${env.VITE_API_URL}${path}`, init);
    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.clone().json()) as { error?: string };
        if (body?.error) detail = `: ${body.error}`;
      } catch {
        /* non-JSON error */
      }
      throw new ApiError(`Request failed (${response.status})${detail}`, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      if (retry && error.status && error.status >= 500) {
        await new Promise((r) => setTimeout(r, 800));
        return request<T>(path, init, false);
      }
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(`Request timed out. Is the backend running at ${env.VITE_API_URL}?`);
    }
    if (error instanceof TypeError) {
      throw new ApiError(`Cannot reach the backend. Start Express so ${env.VITE_API_URL} responds.`);
    }
    if (retry) {
      await new Promise((r) => setTimeout(r, 800));
      return request<T>(path, init, false);
    }
    throw error instanceof Error ? error : new ApiError("Request failed");
  }
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export async function fetchDashboardSummary(deviceId?: string, retry = true): Promise<DashboardSummary> {
  const url = deviceId
    ? `/dashboard/summary?device_id=${encodeURIComponent(deviceId)}`
    : `/dashboard/summary`;
  try {
    return await request<DashboardSummary>(url, undefined, retry);
  } catch (error) {
    if (error instanceof ApiError)
      throw new ApiError(`Unable to load dashboard data. ${error.message}`, error.status);
    throw error;
  }
}

export function fetchZones(deviceId = "AGROSENSE01") {
  return request<{ device_id: string; mode: "auto" | "manual"; zones: ZoneInfo[] }>(
    `/zones?device_id=${encodeURIComponent(deviceId)}`
  );
}

export function updateZoneSettings(
  deviceId: string,
  zoneId: number,
  patch: { crop?: string; moisture_min?: number; moisture_max?: number }
) {
  return request<{ device_id: string; zone: ZoneInfo }>(
    `/devices/${encodeURIComponent(deviceId)}/zones/${zoneId}/settings`,
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }
  );
}

export type PumpCommandResult = {
  device_id: string;
  zone_id: number;
  pump_status: boolean;
  already?: boolean;
  trigger?: "manual" | "auto";
  warning?: string;
  command?: { request_id: string; delivery: "sent" | "disabled" | "offline"; ack: string };
};

export type CommandAckUpdate = {
  request_id: string;
  device_id: string;
  zone_id: number;
  action: "on" | "off";
  ok: boolean;
  message?: string;
};

export function setPump(deviceId: string, zoneId: number, action: "on" | "off") {
  return request<PumpCommandResult>(
    `/devices/${encodeURIComponent(deviceId)}/zones/${zoneId}/pump`,
    json({ action, trigger: "manual" })
  );
}

export function fetchReadiness() {
  return request<{
    ready: boolean;
    database: "postgres" | "in-memory";
    mqtt: { enabled: boolean; connected: boolean; pending: number };
  }>(`/ready`);
}

export function fetchPendingCommands(deviceId = "AGROSENSE01") {
  return request<{
    device_id: string;
    commands: Array<{
      request_id: string;
      zone_id: number;
      action: "on" | "off";
      status: string;
      issued_at: string;
    }>;
    mqtt: { enabled: boolean; connected: boolean; pending: number };
  }>(`/devices/${encodeURIComponent(deviceId)}/commands/pending`);
}

export function fetchMode(deviceId = "AGROSENSE01") {
  return request<DeviceControl>(`/devices/${encodeURIComponent(deviceId)}/mode`);
}

export function updateMode(deviceId: string, mode: "auto" | "manual") {
  return request<DeviceControl>(`/devices/${encodeURIComponent(deviceId)}/mode`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

export function fetchHistory(
  deviceId = "AGROSENSE01",
  opts: { zoneId?: number; trigger?: string; limit?: number } = {}
) {
  const params = new URLSearchParams({ device_id: deviceId });
  if (opts.zoneId) params.set("zone_id", String(opts.zoneId));
  if (opts.trigger) params.set("trigger", opts.trigger);
  if (opts.limit) params.set("limit", String(opts.limit));
  return request<{ device_id: string; events: IrrigationEvent[]; stats: IrrigationStats }>(
    `/irrigation/history?${params.toString()}`
  );
}

export function historyCsvUrl(
  deviceId = "AGROSENSE01",
  opts: { zoneId?: number; trigger?: string } = {}
): string {
  const params = new URLSearchParams({ device_id: deviceId, limit: "200" });
  if (opts.zoneId) params.set("zone_id", String(opts.zoneId));
  if (opts.trigger) params.set("trigger", opts.trigger);
  return `${env.VITE_API_URL}/irrigation/history.csv?${params.toString()}`;
}

export function fetchAlerts(deviceId = "AGROSENSE01", unreadOnly = false) {
  const params = new URLSearchParams({ device_id: deviceId, limit: "50" });
  if (unreadOnly) params.set("unread_only", "true");
  return request<{ device_id: string; alerts: AlertItem[]; unread: number }>(`/alerts?${params.toString()}`);
}

export function markAlertRead(id: string) {
  return request<AlertItem>(`/alerts/${encodeURIComponent(id)}/read`, { method: "PATCH" });
}

export function markAllAlertsRead(deviceId = "AGROSENSE01") {
  return request<{ device_id: string; marked: number }>(`/alerts/read-all`, json({ device_id: deviceId }));
}

export function fetchAnalysis(deviceId = "AGROSENSE01") {
  return request<PlantAnalysis>(`/plants/analysis?device_id=${encodeURIComponent(deviceId)}`);
}
