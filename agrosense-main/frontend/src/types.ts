export type ZoneTelemetry = {
  zone_id: number;
  soil_moisture: number;
  pump_status: boolean;
};

export type DashboardSummary = {
  device_id: string;
  last_updated: string | null;
  system: {
    temperature: number;
    humidity: number;
    water_level: number;
    rain: boolean;
    flow_rate: number;
  } | null;
  zones: ZoneTelemetry[];
  water_usage_liters: number | null;
  system_status: "online" | "offline";
  alerts_unread?: number;
  mode?: "auto" | "manual";
};

export type ZoneInfo = {
  zone_id: number;
  crop: string;
  moisture_min: number;
  moisture_max: number;
  soil_moisture: number | null;
  pump_status: boolean;
  health: "healthy" | "dry" | "saturated" | "unknown";
};

export type DeviceControl = {
  device_id: string;
  mode: "auto" | "manual";
  zones: Array<{ zone_id: number; crop: string; moisture_min: number; moisture_max: number }>;
  updated_at: string;
};

export type IrrigationEvent = {
  id: string;
  device_id: string;
  zone_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  water_used_liters: number | null;
  moisture_before: number | null;
  moisture_after: number | null;
  trigger: "manual" | "auto" | "telemetry";
  pump_status: boolean;
};

export type IrrigationStats = {
  today_liters: number;
  total_liters: number;
  total_events: number;
  active_zones: number;
  per_zone: Array<{ zone_id: number; liters: number; events: number }>;
};

export type AlertItem = {
  id: string;
  device_id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  zone_id: number | null;
  created_at: string;
  read: boolean;
};

export type PlantZoneAnalysis = {
  zone_id: number;
  crop: string;
  health_score: number;
  health: "excellent" | "good" | "stressed" | "critical" | "unknown";
  growth_stage: string;
  recommended_moisture: { min: number; max: number };
  issues: string[];
  recommendations: string[];
};

export type PlantAnalysis = {
  device_id: string;
  evaluated_at: string;
  zones: PlantZoneAnalysis[];
  environment: {
    temperature: number | null;
    humidity: number | null;
    water_level: number | null;
    rain: boolean | null;
  };
};
