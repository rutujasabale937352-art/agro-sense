export const ZONE_CROPS: Record<number, string> = {
  1: "Mango",
  2: "Tomato",
  3: "Chili",
};

/** Fallback crop names for zones the backend hasn't configured yet. */
export function cropForZone(zoneId: number): string {
  return ZONE_CROPS[zoneId] ?? `Crop ${zoneId}`;
}
