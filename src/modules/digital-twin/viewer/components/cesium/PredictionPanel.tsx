import { useCallback, useEffect, useState } from "react";

import {
  fetchLatestPrediction,
  fetchPredictionRuns,
  runPrediction,
  type PredictionDetail,
  type PredictionRun,
} from "../../api/predictions";
import { usePredictionLayers } from "../../hooks/usePredictionLayers";

type Props = { projectId: string | null };

function riskPct(v: number) {
  return `${(v * 100).toFixed(0)}%`;
}

export function PredictionPanel({ projectId }: Props) {
  const [runs, setRuns] = useState<PredictionRun[]>([]);
  const [detail, setDetail] = useState<PredictionDetail | null>(null);
  const [horizon, setHorizon] = useState(30);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);

  const { refreshPredictionMap } = usePredictionLayers(projectId, showMap);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const list = await fetchPredictionRuns(projectId);
      setRuns(list.items);
      if (list.items.some((r) => r.status === "completed")) {
        const latest = await fetchLatestPrediction(projectId);
        setDetail(latest);
      } else {
        setDetail(null);
      }
    } catch {
      setRuns([]);
      setDetail(null);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRun = async () => {
    if (!projectId) return;
    setBusy(true);
    setMsg(null);
    try {
      const run = await runPrediction(projectId, horizon);
      setMsg(`Modelo ${run.model_version}: ${run.status}`);
      await load();
      await refreshPredictionMap();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha na previsão");
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) {
    return (
      <section className="prediction-panel">
        <h3>Previsão IA</h3>
        <p className="hint">Selecione um projeto.</p>
      </section>
    );
  }

  const summary = detail?.summary as Record<string, unknown> | undefined;
  const inputs = summary?.inputs as Record<string, number> | undefined;

  return (
    <section className="prediction-panel">
      <h3>Previsão IA — deformação</h3>
      <p className="prediction-sub">
        Entradas: InSAR, chuva, GNSS, IoT · Saídas: risco, deslocamento, mapa P(falha)
      </p>

      <div className="prediction-controls">
        <label>
          Horizonte (dias)
          <input
            type="number"
            min={7}
            max={365}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void onRun()}>
          Executar modelo
        </button>
        <label className="alerts-map-toggle">
          <input
            type="checkbox"
            checked={showMap}
            onChange={(e) => setShowMap(e.target.checked)}
          />
          Mapa P(falha)
        </label>
      </div>

      {msg && <p className="alerts-msg">{msg}</p>}

      {detail && (
        <div className="prediction-summary">
          <div
            className="prediction-kpi"
            data-level={kpiLevel(Number(summary?.max_rupture_risk))}
          >
            <span className="kpi-label">Risco ruptura (máx.)</span>
            <strong>{riskPct(Number(summary?.max_rupture_risk ?? 0))}</strong>
          </div>
          <div className="prediction-kpi">
            <span className="kpi-label">Desloc. previsto (máx.)</span>
            <strong>{Number(summary?.max_forecast_mm ?? 0).toFixed(1)} mm</strong>
          </div>
          <div className="prediction-kpi">
            <span className="kpi-label">Pontos</span>
            <strong>{String(summary?.point_count ?? detail.points.length)}</strong>
          </div>
        </div>
      )}

      {inputs && (
        <ul className="prediction-inputs">
          <li>Chuva 30d: {inputs.rain_30d_mm?.toFixed(0)} mm</li>
          <li>GNSS: {inputs.gnss_velocity_mm_yr?.toFixed(1)} mm/ano</li>
          <li>IoT anomalia: {riskPct(inputs.iot_anomaly ?? 0)}</li>
          <li>InSAR: {inputs.insar_points} pontos</li>
        </ul>
      )}

      {detail && detail.points.length > 0 && (
        <ul className="prediction-points">
          {detail.points.map((p) => (
            <li key={p.id} data-risk={p.rupture_risk > 0.6 ? "high" : "low"}>
              <span>Risco {riskPct(p.rupture_risk)}</span>
              <span>Prev. {p.forecast_displacement_mm.toFixed(1)} mm</span>
              <span>P(falha) {riskPct(p.failure_probability)}</span>
            </li>
          ))}
        </ul>
      )}

      {runs.length > 0 && (
        <p className="prediction-runs-meta">
          {runs.length} execução(ões) · {detail?.model_version ?? "—"}
        </p>
      )}
    </section>
  );
}

function kpiLevel(risk: number | undefined): string {
  if (risk == null) return "low";
  if (risk >= 0.7) return "critical";
  if (risk >= 0.4) return "warning";
  return "low";
}
