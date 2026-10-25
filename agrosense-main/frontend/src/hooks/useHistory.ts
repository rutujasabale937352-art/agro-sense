import { useCallback, useEffect, useState } from "react";
import { fetchHistory } from "@/api";
import { getSocket } from "@/lib/socket";
import type { IrrigationEvent, IrrigationStats } from "@/types";

export function useHistory(deviceId = "AGROSENSE01", filters: { zoneId?: number; trigger?: string } = {}) {
  const [events, setEvents] = useState<IrrigationEvent[]>([]);
  const [stats, setStats] = useState<IrrigationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { zoneId, trigger } = filters;

  const load = useCallback(async () => {
    try {
      const data = await fetchHistory(deviceId, { zoneId, trigger, limit: 100 });
      setEvents(data.events);
      setStats(data.stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load history");
    } finally {
      setLoading(false);
    }
  }, [deviceId, zoneId, trigger]);

  useEffect(() => {
    // Fetch on mount / filter change — syncing external backend state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    // irrigation:update already fires alongside dashboard:summary on every
    // ingest, so one listener is enough (two would double-fetch per tick).
    const socket = getSocket();
    const onUpdate = () => void load();
    socket.on("irrigation:update", onUpdate);
    return () => {
      socket.off("irrigation:update", onUpdate);
    };
  }, [load]);

  return { events, stats, loading, error, reload: load };
}
