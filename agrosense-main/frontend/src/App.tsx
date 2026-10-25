import { Suspense, lazy, useState } from "react";
import { DashboardSkeleton } from "@/components/Loading";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { NAVIGATION, Sidebar, type ViewKey } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { useAlerts } from "@/hooks/useAlerts";
import { useDashboard } from "@/hooks/useDashboard";
import { useHistory } from "@/hooks/useHistory";
import { useZones } from "@/hooks/useZones";

const LivePage = lazy(() => import("@/pages/LivePage").then((m) => ({ default: m.LivePage })));
const ZonesPage = lazy(() => import("@/pages/ZonesPage").then((m) => ({ default: m.ZonesPage })));
const ControlPage = lazy(() => import("@/pages/ControlPage").then((m) => ({ default: m.ControlPage })));
const HistoryPage = lazy(() => import("@/pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const AlertsPage = lazy(() => import("@/pages/AlertsPage").then((m) => ({ default: m.AlertsPage })));
const AnalysisPage = lazy(() => import("@/pages/AnalysisPage").then((m) => ({ default: m.AnalysisPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

function App() {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const { summary, connection, error, loading, retry } = useDashboard();
  const deviceId = summary?.device_id ?? "AGROSENSE01";
  // Zone config + history stats refresh on socket pushes, not on every render.
  const { zones } = useZones(deviceId);
  const { stats } = useHistory(deviceId);
  const { unread } = useAlerts(deviceId);
  const title = NAVIGATION.find((n) => n.key === activeView)?.label ?? "Overview";

  return (
    <div className="flex min-h-screen bg-slate-100 font-sans text-slate-900 antialiased">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <main className="min-w-0 flex-1">
        <Topbar
          connection={connection}
          title={title}
          unread={unread}
          onBell={() => setActiveView("alerts")}
        />
        {activeView === "dashboard" ? (
          loading && !summary ? (
            <div className="mx-auto w-full max-w-[1440px] p-6 max-md:p-4">
              <DashboardSkeleton />
            </div>
          ) : (
            <DashboardPage
              summary={summary}
              zones={zones}
              stats={stats}
              error={error}
              loading={loading}
              onRetry={retry}
              onNavigate={setActiveView}
            />
          )
        ) : (
          <Suspense
            fallback={
              <div className="mx-auto w-full max-w-[1100px] p-6 max-md:p-4">
                <DashboardSkeleton />
              </div>
            }
          >
            {activeView === "live" && <LivePage summary={summary} deviceId={deviceId} />}
            {activeView === "zones" && <ZonesPage deviceId={deviceId} />}
            {activeView === "control" && <ControlPage summary={summary} deviceId={deviceId} />}
            {activeView === "history" && <HistoryPage deviceId={deviceId} />}
            {activeView === "alerts" && <AlertsPage deviceId={deviceId} />}
            {activeView === "analysis" && <AnalysisPage deviceId={deviceId} />}
            {activeView === "settings" && <SettingsPage summary={summary} deviceId={deviceId} />}
          </Suspense>
        )}
      </main>
    </div>
  );
}

export default App;
