import type { DeviceControlState, PlantAnalysis, PlantZoneAnalysis } from "../types/irrigation";
import type { TelemetryPayload } from "../types/telemetry";

function scoreZone(moisture: number | null, temp: number | null, humidity: number | null, min: number, max: number): number {
  if (moisture === null) return 0;
  let score = 100;
  if (moisture < min) score -= Math.min(50, (min - moisture) * 2.2);
  if (moisture > max) score -= Math.min(35, (moisture - max) * 1.6);
  if (temp !== null && temp > 36) score -= Math.min(25, (temp - 36) * 4);
  if (humidity !== null && humidity < 30) score -= 10;
  return Math.max(0, Math.round(score));
}

function stageForCrop(crop: string, score: number): string {
  const base: Record<string, string[]> = {
    Mango: ["Flowering", "Fruit set", "Fruit development"],
    Tomato: ["Vegetative", "Flowering", "Fruiting"],
    Chili: ["Vegetative", "Flowering", "Harvest"],
  };
  const stages = base[crop] ?? ["Vegetative", "Growth", "Maturity"];
  if (score >= 80) return stages[2];
  if (score >= 55) return stages[1];
  return stages[0];
}

export function buildPlantAnalysis(
  deviceId: string,
  latest: TelemetryPayload | null,
  control: DeviceControlState
): PlantAnalysis {
  const now = new Date().toISOString();
  const env = {
    temperature: latest?.system.temperature ?? null,
    humidity: latest?.system.humidity ?? null,
    water_level: latest?.system.water_level ?? null,
    rain: latest?.system.rain ?? null,
  };

  const zones: PlantZoneAnalysis[] = control.zones.map((cfg) => {
    const live = latest?.zones.find((z) => z.zone_id === cfg.zone_id);
    const moisture = live?.soil_moisture ?? null;
    const score = scoreZone(moisture, env.temperature, env.humidity, cfg.moisture_min, cfg.moisture_max);
    const health =
      moisture === null
        ? "unknown"
        : score >= 85
          ? "excellent"
          : score >= 65
            ? "good"
            : score >= 45
              ? "stressed"
              : "critical";
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (moisture === null) {
      issues.push("No live moisture reading.");
      recommendations.push("Check sensor connectivity for this zone.");
    } else if (moisture < cfg.moisture_min) {
      issues.push(`Dry at ${moisture}% (target ${cfg.moisture_min}–${cfg.moisture_max}%).`);
      recommendations.push(
        live?.pump_status ? "Pump is running — verify flow reaches the roots." : "Run a short irrigation cycle for this zone."
      );
    } else if (moisture > cfg.moisture_max) {
      issues.push(`Saturated at ${moisture}%.`);
      recommendations.push("Hold irrigation and let the soil drain to avoid root stress.");
    } else {
      recommendations.push("Moisture is in range — keep the current schedule.");
    }
    if (env.temperature !== null && env.temperature > 36) {
      issues.push(`Heat stress risk at ${env.temperature}°C.`);
      recommendations.push("Prefer early-morning irrigation and mulch exposed soil.");
    }
    if (env.rain) recommendations.push("Rain detected — skip the next scheduled cycle.");

    return {
      zone_id: cfg.zone_id,
      crop: cfg.crop,
      health_score: score,
      health,
      growth_stage: stageForCrop(cfg.crop, score),
      recommended_moisture: { min: cfg.moisture_min, max: cfg.moisture_max },
      issues,
      recommendations,
    };
  });

  return { device_id: deviceId, evaluated_at: now, zones, environment: env };
}
