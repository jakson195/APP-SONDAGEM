/** Resposta bruta da API FastAPI (snake_case). */

export type ApiAlertLevel = "info" | "attention" | "danger";
export type ApiTrend = "up" | "down" | "stable";

export type ApiStation = {
  id: string;
  name: string;
  river: string;
  level_m: number;
  flood_stage_m: number;
  trend: ApiTrend;
  lat: number;
  lng: number;
  flood_pct?: number | null;
};

export type ApiKpis = {
  current_level_m: number;
  rain_24h_mm: number;
  peak_predicted_m: number;
  peak_eta_hours: number;
  active_alerts: number;
  model_rmse: number;
  model_nse: number;
};

export type ApiLevelPoint = {
  time: string;
  observed: number | null;
  predicted_6h: number | null;
  predicted_12h: number | null;
  predicted_24h: number | null;
  rain_mm: number;
};

export type ApiRainHour = {
  hour: string;
  mm: number;
  prob: number;
};

export type ApiAlert = {
  id: string;
  level: ApiAlertLevel;
  title: string;
  message: string;
  station_id: string;
  timestamp: string;
  read: boolean;
};

export type ApiDashboard = {
  basin_name: string;
  primary_station_id: string;
  updated_at: string;
  kpis: ApiKpis;
  stations: ApiStation[];
  level_series: ApiLevelPoint[];
  rain_forecast: ApiRainHour[];
  alerts: ApiAlert[];
  model_metrics: { rmse: number; nse: number };
};

export type WsEnvelope =
  | { type: "dashboard"; payload: ApiDashboard }
  | { type: "alert"; payload: ApiAlert }
  | { type: "ping"; payload: { ok: boolean } };
