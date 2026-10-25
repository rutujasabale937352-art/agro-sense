import { z } from "zod";

export const pumpActionSchema = z.object({
  action: z.enum(["on", "off"]),
  trigger: z.enum(["manual", "auto"]).default("manual"),
});

export const zoneSettingsSchema = z.object({
  crop: z.string().min(1).max(40).optional(),
  moisture_min: z.number().min(0).max(100).optional(),
  moisture_max: z.number().min(0).max(100).optional(),
}).refine(
  (v) => v.moisture_min === undefined || v.moisture_max === undefined || v.moisture_min < v.moisture_max,
  { message: "moisture_min must be below moisture_max" }
);

export const modeSchema = z.object({
  mode: z.enum(["auto", "manual"]),
});

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

export const historyQuerySchema = z.object({
  device_id: z.string().min(1).default("AGROSENSE01"),
  zone_id: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  trigger: z.enum(["manual", "auto", "telemetry"]).optional(),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(200).default(50)),
});
