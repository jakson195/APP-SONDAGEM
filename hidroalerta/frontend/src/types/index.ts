export type AlertLevel = "info" | "attention" | "danger";

export type Alert = {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  stationId: string;
  timestamp: string;
  read: boolean;
};

export type Station = {
  id: string;
  name: string;
  river: string;
  levelM: number;
  floodStageM: number;
  trend: "up" | "down" | "stable";
  lat: number;
  lng: number;
};

export type LevelPoint = {
  time: string;
  observed: number | null;
  predicted6h: number | null;
  predicted12h: number | null;
  predicted24h: number | null;
  rainMm: number;
};

export type RainHour = {
  hour: string;
  mm: number;
  prob: number;
};

export type KpiSnapshot = {
  currentLevelM: number;
  rain24hMm: number;
  peakPredictedM: number;
  peakEtaHours: number;
  activeAlerts: number;
  modelRmse: number;
  modelNse: number;
};

export type LiveUpdate = {
  kpis: KpiSnapshot;
  stations: Station[];
  timestamp: string;
};
