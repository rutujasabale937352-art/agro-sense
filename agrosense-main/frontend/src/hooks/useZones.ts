import { useCallback, useEffect, useState } from "react";
import { fetchZones } from "@/api";
import type { ZoneInfo } from "@/types";

/** Zone config (crop, thresholds) + live state from the backend. Fetched on demand — not on every tick. */
export function useZones(deviceId: string) {
  const [zones, setZones] = useState<ZoneInfo[]>([]);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchZones(deviceId);
      setZones(data.zones);
      setMode(data.mode);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load zones");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    // Fetch on mount / device change — syncing external backend state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void load();
  }, [load]);

  return { zones, mode, loading, error, reload: load, setZones };
}
