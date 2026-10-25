export type PumpTrigger = "manual" | "auto" | "telemetry";

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
  trigger: PumpTrigger;
  pump_status: boolean;
};

export type ZoneSettings = {
  zone_id: number;
  crop: string;
  moisture_min: number;
  moisture_max: number;
};

export type SystemMode = "auto" | "manual";

export type DeviceControlState = {
  device_id: string;
  mode: SystemMode;
  zones: ZoneSettings[];
  updated_at: string;
};

export type AlertType =
  | "low_moisture"
  | "high_temperature"
  | "low_water"
  | "rain"
  | "pump_anomaly"
  | "offline"
  | "system";

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertItem = {
  id: string;
  device_id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  zone_id: number | null;
  created_at: string;
  read: boolean;
};

export type ZoneInfo = ZoneSettings & {
  soil_moisture: number | null;
  pump_status: boolean;
  health: "healthy" | "dry" | "saturated" | "unknown";
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
