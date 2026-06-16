import { useCallback, useEffect, useRef, useState } from "react";
import { apiEnabled, fetchDashboard, tickDashboard, wsUrl } from "../api/client";
import { mapDashboard } from "../api/mapDashboard";
import type { WsEnvelope } from "../api/types";
import {
  mockAlerts,
  mockKpis,
  mockLevelSeries,
  mockRainForecast,
  mockStations,
  PRIMARY_STATION_ID,
  tickLiveData,
} from "../data/mockData";
import type { Alert, KpiSnapshot, LevelPoint, RainHour, Station } from "../types";

const MOCK_INTERVAL_MS = 5000;
const WS_RECONNECT_MS = 4000;

type LiveSlice = {
  kpis: KpiSnapshot;
  stations: Station[];
  alerts: Alert[];
  levelSeries: LevelPoint[];
  rainForecast: RainHour[];
  lastUpdate: string;
};

const mockInitial: LiveSlice = {
  kpis: mockKpis,
  stations: mockStations,
  alerts: mockAlerts,
  levelSeries: mockLevelSeries,
  rainForecast: mockRainForecast,
  lastUpdate: new Date().toISOString(),
};

/** Dashboard live — WebSocket FastAPI ou fallback mock local. */
export function useLiveDashboard() {
  const [live, setLive] = useState<LiveSlice>(mockInitial);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);

  const applyDashboard = useCallback((mapped: ReturnType<typeof mapDashboard>) => {
    setLive({
      kpis: mapped.kpis,
      stations: mapped.stations,
      alerts: mapped.alerts,
      levelSeries: mapped.levelSeries,
      rainForecast: mapped.rainForecast,
      lastUpdate: mapped.updatedAt,
    });
  }, []);

  const refresh = useCallback(async () => {
    if (apiEnabled()) {
      try {
        const raw = await tickDashboard();
        applyDashboard(mapDashboard(raw));
        return;
      } catch {
        /* fallback mock abaixo */
      }
    }
    setLive((prev) => {
      const next = tickLiveData(prev.kpis, prev.stations);
      return {
        ...prev,
        kpis: next.kpis,
        stations: next.stations,
        lastUpdate: new Date().toISOString(),
      };
    });
  }, [applyDashboard]);

  useEffect(() => {
    if (!apiEnabled()) {
      const id = window.setInterval(refresh, MOCK_INTERVAL_MS);
      return () => window.clearInterval(id);
    }

    let cancelled = false;

    const loadInitial = async () => {
      try {
        const raw = await fetchDashboard();
        if (!cancelled) applyDashboard(mapDashboard(raw));
      } catch {
        /* mantém mock até WS conectar */
      }
    };

    void loadInitial();

    const connect = () => {
      const url = wsUrl();
      if (!url || cancelled) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string) as WsEnvelope;
          if (msg.type === "dashboard") {
            applyDashboard(mapDashboard(msg.payload));
          } else if (msg.type === "alert") {
            setLive((prev) => ({
              ...prev,
              alerts: [
                {
                  id: msg.payload.id,
                  level: msg.payload.level,
                  title: msg.payload.title,
                  message: msg.payload.message,
                  stationId: msg.payload.station_id,
                  timestamp: msg.payload.timestamp,
                  read: msg.payload.read,
                },
                ...prev.alerts,
              ].slice(0, 50),
            }));
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!cancelled) {
          reconnectRef.current = window.setTimeout(connect, WS_RECONNECT_MS);
        }
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [applyDashboard, refresh]);

  const primary =
    live.stations.find((s) => s.id === PRIMARY_STATION_ID) ?? live.stations[0]!;
  const unreadAlerts = live.alerts.filter((a) => !a.read).length;

  return {
    kpis: live.kpis,
    stations: live.stations,
    alerts: live.alerts,
    levelSeries: live.levelSeries,
    rainForecast: live.rainForecast,
    lastUpdate: live.lastUpdate,
    refresh,
    primary,
    unreadAlerts,
    connected,
    apiMode: apiEnabled(),
  };
}
