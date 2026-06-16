import type { Alert, KpiSnapshot, LevelPoint, RainHour, Station } from "../types";

export const BASIN_NAME = "Bacia do Rio Itajaí-Açu";
export const PRIMARY_STATION_ID = "st-ita-01";

export const mockStations: Station[] = [
  {
    id: "st-ita-01",
    name: "Blumenau — Ponte da Vila",
    river: "Itajaí-Açu",
    levelM: 8.42,
    floodStageM: 10.0,
    trend: "up",
    lat: -26.9194,
    lng: -49.0661,
  },
  {
    id: "st-ita-02",
    name: "Gaspar — BR-470",
    river: "Itajaí-Açu",
    levelM: 6.18,
    floodStageM: 9.5,
    trend: "up",
    lat: -26.9314,
    lng: -48.9589,
  },
  {
    id: "st-ita-03",
    name: "Indaial — Centro",
    river: "Itajaí-Açu",
    levelM: 4.05,
    floodStageM: 8.0,
    trend: "stable",
    lat: -26.8978,
    lng: -49.2317,
  },
  {
    id: "st-ita-04",
    name: "Apiúna — Ponte",
    river: "Itajaí-Açu",
    levelM: 3.21,
    floodStageM: 7.2,
    trend: "down",
    lat: -27.0375,
    lng: -49.3889,
  },
];

export const mockKpis: KpiSnapshot = {
  currentLevelM: 8.42,
  rain24hMm: 47.3,
  peakPredictedM: 9.85,
  peakEtaHours: 14,
  activeAlerts: 2,
  modelRmse: 0.34,
  modelNse: 0.91,
};

function hoursAgo(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
}

export const mockLevelSeries: LevelPoint[] = Array.from({ length: 48 }, (_, i) => {
  const h = 47 - i;
  const base = 6.8 + Math.sin(i / 6) * 0.8;
  const rain = i > 30 ? (i - 30) * 0.15 : 0;
  const observed = i >= 6 ? base + rain + (Math.random() - 0.5) * 0.2 : null;
  const future = i < 6 ? base + rain * 1.2 : null;
  return {
    time: hoursAgo(h),
    observed,
    predicted6h: future != null ? future + 0.3 : null,
    predicted12h: future != null ? future + 0.55 : null,
    predicted24h: future != null ? future + 0.9 : null,
    rainMm: i > 28 ? Math.max(0, (i - 28) * 1.8 + Math.random() * 2) : Math.random() * 0.5,
  };
});

export const mockRainForecast: RainHour[] = Array.from({ length: 36 }, (_, i) => {
  const d = new Date();
  d.setHours(d.getHours() + i);
  const peak = i >= 8 && i <= 18;
  return {
    hour: d.toISOString(),
    mm: peak ? 2 + Math.random() * 8 : Math.random() * 1.5,
    prob: peak ? 60 + Math.random() * 35 : 10 + Math.random() * 40,
  };
});

export const mockAlerts: Alert[] = [
  {
    id: "a1",
    level: "attention",
    title: "Nível em ascensão",
    message: "Blumenau — Ponte da Vila atinge 84% da cota de inundação. Pico previsto em ~14h.",
    stationId: "st-ita-01",
    timestamp: new Date(Date.now() - 12 * 60_000).toISOString(),
    read: false,
  },
  {
    id: "a2",
    level: "danger",
    title: "Risco de transbordamento",
    message: "Previsão LSTM 24h: 9,85 m (> cota 10,0 m). HEC-RAS acionado para mancha de inundação.",
    stationId: "st-ita-01",
    timestamp: new Date(Date.now() - 45 * 60_000).toISOString(),
    read: false,
  },
  {
    id: "a3",
    level: "info",
    title: "Ingestão ANA concluída",
    message: "Dados HidroWeb atualizados — 4 estações, horário :00.",
    stationId: "st-ita-01",
    timestamp: new Date(Date.now() - 2 * 3600_000).toISOString(),
    read: true,
  },
  {
    id: "a4",
    level: "info",
    title: "OpenMeteo — previsão 36h",
    message: "Chuva acumulada prevista: 62 mm. Pico entre 14h e 22h.",
    stationId: "st-ita-02",
    timestamp: new Date(Date.now() - 3 * 3600_000).toISOString(),
    read: true,
  },
];

/** Simula tick WebSocket — pequena variação nos KPIs. */
export function tickLiveData(
  kpis: KpiSnapshot,
  stations: Station[],
): { kpis: KpiSnapshot; stations: Station[] } {
  const drift = (Math.random() - 0.48) * 0.08;
  return {
    kpis: {
      ...kpis,
      currentLevelM: Math.round((kpis.currentLevelM + drift) * 100) / 100,
      peakPredictedM: Math.round((kpis.peakPredictedM + drift * 0.5) * 100) / 100,
    },
    stations: stations.map((s) =>
      s.id === PRIMARY_STATION_ID
        ? {
            ...s,
            levelM: Math.round((s.levelM + drift) * 100) / 100,
            trend: drift > 0.02 ? "up" : drift < -0.02 ? "down" : "stable",
          }
        : s,
    ),
  };
}
