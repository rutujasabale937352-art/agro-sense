export type ZoneTelemetry = {
  zone_id: number;
  soil_moisture: number;
  pump_status: boolean;
};

export type TelemetryPayload = {
  device_id: string;
  timestamp?: string;
  system: {
    temperature: number;
    humidity: number;
    water_level: number;
    rain: boolean;
    flow_rate: number;
  };
  zones: ZoneTelemetry[];
};

export type DashboardSummary = {
  device_id: string;
  last_updated: string | null;
  system: TelemetryPayload["system"] | null;
  zones: ZoneTelemetry[];
  water_usage_liters: number | null;
  system_status: "online" | "offline";
};
