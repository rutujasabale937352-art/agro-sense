import { useCallback, useEffect, useState } from "react";
import { fetchAlerts, markAlertRead, markAllAlertsRead } from "@/api";
import { getSocket } from "@/lib/socket";
import type { AlertItem } from "@/types";

export function useAlerts(deviceId = "AGROSENSE01", unreadOnly = false) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAlerts(deviceId, unreadOnly);
      setAlerts(data.alerts);
      setUnread(data.unread);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load alerts");
    } finally {
      setLoading(false);
    }
  }, [deviceId, unreadOnly]);

  useEffect(() => {
    // Fetch on mount / filter change — syncing external backend state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onUpdate = (payload: { alerts: AlertItem[]; unread: number }) => {
      // Server is the source of truth for the unread count.
      setAlerts(unreadOnly ? payload.alerts.filter((a) => !a.read) : payload.alerts);
      setUnread(payload.unread);
    };
    socket.on("alerts:update", onUpdate);
    return () => {
      socket.off("alerts:update", onUpdate);
    };
  }, [unreadOnly]);

  const ack = useCallback(
    async (id: string) => {
      const wasUnread = alerts.some((a) => a.id === id && !a.read);
      const updated = await markAlertRead(id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      if (wasUnread) setUnread((u) => Math.max(0, u - 1));
    },
    [alerts]
  );

  const ackAll = useCallback(async () => {
    await markAllAlertsRead(deviceId);
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnread(0);
  }, [deviceId]);

  return { alerts, unread, loading, error, reload: load, ack, ackAll };
}
