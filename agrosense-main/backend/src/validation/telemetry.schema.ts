import { z } from "zod";

const zonesSchema = z.array(z.object({
  zone_id: z.number().int().positive(),
  soil_moisture: z.number().finite().min(0).max(100),
  pump_status: z.boolean()
})).min(1).max(24).superRefine((zones, context) => {
  const seen = new Set<number>();
  zones.forEach((zone, index) => {
    if (seen.has(zone.zone_id)) {
      context.addIssue({
        code: "custom",
        path: [index, "zone_id"],
        message: "Zone IDs must be unique"
      });
    }
    seen.add(zone.zone_id);
  });
});

export const telemetrySchema = z.object({
  device_id: z.string().min(1).max(64),
  timestamp: z.string().datetime({ offset: true }).optional(),
  system: z.object({
    temperature: z.number().finite().min(-50).max(60),
    humidity: z.number().min(0).max(100),
    water_level: z.number().min(0).max(100).nullable(),
    rain: z.boolean(),
    flow_rate: z.number().finite().min(0)
  }),
  zones: zonesSchema
});

export type ValidatedTelemetry = z.infer<typeof telemetrySchema>;
