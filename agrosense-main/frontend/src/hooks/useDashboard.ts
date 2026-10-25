import { useCallback, useEffect, useState } from "react";
import { fetchDashboardSummary } from "@/api";
import { getSocket } from "@/lib/socket";
import type { DashboardSummary } from "@/types";

export type ConnectionState = "connecting" | "live" | "offline";

export function useDashboard(deviceId = "AGROSENSE01") {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDashboardSummary(deviceId);
      setSummary(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    // Initial fetch on mount — legitimate sync of external backend state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    const socket = getSocket();
    const onConnect = () => setConnection("live");
    const onDown = () => setConnection("offline");
    const onSummary = (next: DashboardSummary) => {
      setSummary(next);
      setError(null);
      setLoading(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDown);
    socket.on("connect_error", onDown);
    socket.on("dashboard:summary", onSummary);
    if (socket.connected) setConnection("live");

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDown);
      socket.off("connect_error", onDown);
      socket.off("dashboard:summary", onSummary);
    };
  }, [load]);

  return { summary, connection, error, loading, retry: load };
}
