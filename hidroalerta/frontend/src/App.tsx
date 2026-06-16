import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { KpiCards } from "./components/dashboard/KpiCards";
import { LevelChart } from "./components/dashboard/LevelChart";
import { StationGauges } from "./components/dashboard/StationGauges";
import { RainForecast } from "./components/dashboard/RainForecast";
import { FloodMap } from "./components/dashboard/FloodMap";
import { AlertCenter } from "./components/dashboard/AlertCenter";
import { ModelMetrics } from "./components/dashboard/ModelMetrics";
import { useLiveDashboard } from "./hooks/useLiveDashboard";

export default function App() {
  const {
    kpis,
    stations,
    alerts,
    levelSeries,
    rainForecast,
    lastUpdate,
    refresh,
    primary,
    unreadAlerts,
  } = useLiveDashboard();

  return (
    <div className="min-h-full bg-bg">
      <Sidebar alertCount={unreadAlerts} />
      <div className="pl-60">
        <Topbar
          lastUpdate={lastUpdate}
          onRefresh={refresh}
          unreadAlerts={unreadAlerts}
        />
        <main className="space-y-6 p-6">
          <KpiCards kpis={kpis} floodStageM={primary.floodStageM} />

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <LevelChart data={levelSeries} floodStageM={primary.floodStageM} />
            </div>
            <StationGauges stations={stations} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <RainForecast data={rainForecast} />
            <ModelMetrics kpis={kpis} />
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <FloodMap />
            </div>
            <AlertCenter alerts={alerts} />
          </div>
        </main>
      </div>
    </div>
  );
}
