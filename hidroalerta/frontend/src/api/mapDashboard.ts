import type { ApiDashboard } from "./types";
import type { Alert, KpiSnapshot, LevelPoint, RainHour, Station } from "../types";

export function mapDashboard(raw: ApiDashboard) {
  const kpis: KpiSnapshot = {
    currentLevelM: raw.kpis.current_level_m,
    rain24hMm: raw.kpis.rain_24h_mm,
    peakPredictedM: raw.kpis.peak_predicted_m,
    peakEtaHours: raw.kpis.peak_eta_hours,
    activeAlerts: raw.kpis.active_alerts,
    modelRmse: raw.kpis.model_rmse,
    modelNse: raw.kpis.model_nse,
  };

  const stations: Station[] = raw.stations.map((s) => ({
    id: s.id,
    name: s.name,
    river: s.river,
    levelM: s.level_m,
    floodStageM: s.flood_stage_m,
    trend: s.trend,
    lat: s.lat,
    lng: s.lng,
  }));

  const levelSeries: LevelPoint[] = raw.level_series.map((p) => ({
    time: p.time,
    observed: p.observed,
    predicted6h: p.predicted_6h,
    predicted12h: p.predicted_12h,
    predicted24h: p.predicted_24h,
    rainMm: p.rain_mm,
  }));

  const rainForecast: RainHour[] = raw.rain_forecast.map((r) => ({
    hour: r.hour,
    mm: r.mm,
    prob: r.prob,
  }));

  const alerts: Alert[] = raw.alerts.map((a) => ({
    id: a.id,
    level: a.level,
    title: a.title,
    message: a.message,
    stationId: a.station_id,
    timestamp: a.timestamp,
    read: a.read,
  }));

  return {
    basinName: raw.basin_name,
    primaryStationId: raw.primary_station_id,
    updatedAt: raw.updated_at,
    kpis,
    stations,
    levelSeries,
    rainForecast,
    alerts,
  };
}
