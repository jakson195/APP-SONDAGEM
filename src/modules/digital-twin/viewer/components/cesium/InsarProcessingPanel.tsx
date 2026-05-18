"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createInsarJob,
  fetchInsarJobStatus,
  fetchInsarPreflight,
  insarGeotiffUrl,
  listInsarRasters,
  retryInsarJob,
  type InsarPipelineStageLog,
  type InsarPreflightResponse,
  type InsarRaster,
} from "../../api/insar";
import { useCesium } from "../../context/CesiumContext";

interface Props {
  projectId: string | null;
}

function stageIcon(ok: boolean): string {
  return ok ? "✓" : "✗";
}

function formatStageLine(s: InsarPipelineStageLog): string {
  const t = s.at?.slice(11, 19) ?? "??:??:??";
  const mark = stageIcon(s.ok);
  const det = s.detail ? ` — ${s.detail}` : "";
  return `[${t}] ${mark} ${s.step}${det}`;
}

export function InsarProcessingPanel({ projectId }: Props) {
  const { layerManager, ready } = useCesium();
  const logEndRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("InSAR S1");
  const [dateFrom, setDateFrom] = useState("2024-01-01");
  const [dateTo, setDateTo] = useState("2024-06-30");
  const [orbit, setOrbit] = useState<"DESC" | "ASC">("DESC");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<InsarPreflightResponse | null>(
    null,
  );
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [pipelineLog, setPipelineLog] = useState<InsarPipelineStageLog[]>([]);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  const refreshPreflight = useCallback(async () => {
    if (!projectId) return;
    setPreflightBusy(true);
    setPreflightError(null);
    try {
      const p = await fetchInsarPreflight(projectId, {
        date_from: dateFrom,
        date_to: dateTo,
        orbit,
      });
      setPreflight(p);
    } catch (e) {
      setPreflight(null);
      setPreflightError(
        e instanceof Error ? e.message : "Falha na validação prévia.",
      );
    } finally {
      setPreflightBusy(false);
    }
  }, [projectId, dateFrom, dateTo, orbit]);

  useEffect(() => {
    if (!projectId) {
      setPreflight(null);
      return;
    }
    const id = setTimeout(() => {
      void refreshPreflight();
    }, 400);
    return () => clearTimeout(id);
  }, [projectId, refreshPreflight]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [pipelineLog]);

  const run = async () => {
    if (!projectId || !layerManager) return;
    setBusy(true);
    setError(null);
    setPipelineLog([]);
    setJobStatus("pending");
    setMessage("A iniciar pipeline InSAR…");
    try {
      const job = await createInsarJob(projectId, {
        name,
        date_from: dateFrom,
        date_to: dateTo,
        orbit_direction: orbit,
        run_immediately: true,
      });
      const initialStages = Array.isArray(
        (job.properties as { stages?: InsarPipelineStageLog[] })?.stages,
      )
        ? ((job.properties as { stages: InsarPipelineStageLog[] }).stages ?? [])
        : [];
      if (initialStages.length > 0) setPipelineLog(initialStages);
      setMessage(`Job #${job.id} criado · ${job.status}`);
      let finishStatus = job.status;
      let polls = 0;
      const maxPolls = 50;

      const poll = async (): Promise<InsarRaster[]> => {
        polls += 1;
        const st = await fetchInsarJobStatus(projectId, job.id);
        finishStatus = st.status;
        const steps =
          (Array.isArray(st.stages) ? st.stages : null) ??
          st.properties?.stages ??
          [];
        setPipelineLog(steps as InsarPipelineStageLog[]);
        setJobStatus(st.status);
        const hint =
          typeof st.properties?.message === "string"
            ? st.properties.message
            : null;
        if (hint) setMessage(`${st.status}: ${hint}`);
        else setMessage(`Estado: ${st.status}`);

        if (st.status === "completed") {
          const rasters = await listInsarRasters(projectId, job.id);
          return rasters.items;
        }
        if (st.status === "failed") {
          const errMsg =
            typeof st.error_message === "string" && st.error_message.trim()
              ? st.error_message
              : "Job InSAR falhou";
          throw new Error(errMsg);
        }
        if (st.status === "pending" && polls === 4) {
          try {
            await retryInsarJob(projectId, job.id);
            setMessage("A reencadear pipeline (estava pending)…");
          } catch {
            /* ignore */
          }
        }
        if (polls >= maxPolls) {
          throw new Error(
            `Pipeline não terminou (último estado: ${st.status}). Veja o log — em dev usa fallback Node (geotiff) se Python/rasterio falhar.`,
          );
        }
        await new Promise((r) => setTimeout(r, 2200));
        return poll();
      };

      const rasters = await poll();
      let n = 0;
      for (const r of rasters) {
        if (r.raster_kind !== "displacement" && r.raster_kind !== "velocity")
          continue;
        await layerManager.addInsarGeotiff({
          name: `${r.raster_kind} ${r.epoch_date ?? ""}`.trim(),
          geotiffUrl: insarGeotiffUrl(projectId, r.id),
          epochDate: r.epoch_date ?? undefined,
          rasterKind: r.raster_kind as "displacement" | "velocity",
          flyTo: n === 0,
        });
        n += 1;
      }
      setMessage(`${n} overlay(s) no Cesium · estado ${finishStatus}`);
      await refreshPreflight();
      window.dispatchEvent(new CustomEvent("insar-rasters-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro InSAR");
    } finally {
      setBusy(false);
    }
  };

  const snapOrSynthOk =
    Boolean(preflight?.processing.snap_configured) ||
    Boolean(preflight?.processing.synthetic_fallback_enabled);

  return (
    <section className="insar-panel">
      <h3>InSAR Processing</h3>
      <p className="las-hint">
        Sentinel-1 (Copernicus CDSE) → SLC → SNAP / fallback → GeoTIFF → Cesium
      </p>

      <div className="insar-preflight">
        <div className="insar-preflight-head">
          <span className="insar-preflight-title">Validação pipeline</span>
          <button
            type="button"
            className="btn-secondary insar-preflight-refresh"
            disabled={!projectId || preflightBusy}
            onClick={() => void refreshPreflight()}
          >
            {preflightBusy ? "…" : "Atualizar"}
          </button>
        </div>
        {preflightError && (
          <p className="las-error insar-preflight-err">{preflightError}</p>
        )}
        {preflight && (
          <ul className="insar-preflight-list" aria-label="Checklist pipeline">
            <li data-ok={preflight.copernicus.credentialsConfigured}>
              <strong>{stageIcon(preflight.copernicus.credentialsConfigured)}</strong>
              Credenciais Copernicus (env)
              {!preflight.copernicus.credentialsConfigured && (
                <span className="insar-preflight-hint">
                  COPERNICUS_USER / COPERNICUS_PASSWORD
                </span>
              )}
            </li>
            <li data-ok={preflight.copernicus.tokenOk}>
              <strong>{stageIcon(preflight.copernicus.tokenOk)}</strong>
              OAuth2 CDSE (token)
              {preflight.copernicus.usernameHint && (
                <span className="insar-preflight-hint">
                  {preflight.copernicus.usernameHint}
                  {preflight.copernicus.expiresInSec != null
                    ? ` · ~${preflight.copernicus.expiresInSec}s`
                    : ""}
                </span>
              )}
              {preflight.copernicus.tokenError && (
                <span className="insar-preflight-hint las-error">
                  {preflight.copernicus.tokenError}
                </span>
              )}
            </li>
            <li data-ok={preflight.catalog.pair_ready}>
              <strong>{stageIcon(preflight.catalog.pair_ready)}</strong>
              Catálogo SLC (obra + período + órbita)
              <span className="insar-preflight-hint">
                total={preflight.catalog.total_entries} · prontas_local=
                {preflight.catalog.ready_slc_local}
              </span>
            </li>
            <li
              data-ok={
                preflight.aoi.obra_geojson_aoi ||
                preflight.catalog.pair_ready
              }
            >
              <strong>
                {stageIcon(
                  preflight.aoi.obra_geojson_aoi ||
                    preflight.catalog.pair_ready,
                )}
              </strong>
              AOI obra / footprints catálogo
              <span className="insar-preflight-hint">
                geojson AOI=
                {preflight.aoi.obra_geojson_aoi ? "sim" : "não"} · coords centro=
                {preflight.aoi.obra_coordinates ? "sim" : "não"}
              </span>
            </li>
            <li data-ok={snapOrSynthOk}>
              <strong>{stageIcon(snapOrSynthOk)}</strong>
              Processamento (SNAP ou fallback sintético)
              <span className="insar-preflight-hint">
                SNAP={preflight.processing.snap_configured ? "sim" : "não"} ·
                fallback=
                {preflight.processing.synthetic_fallback_enabled
                  ? "sim"
                  : "não"}
              </span>
            </li>
            <li data-ok>
              <strong>◎</strong>
              Integração Cesium
              <span className="insar-preflight-hint">{preflight.cesium.note}</span>
            </li>
          </ul>
        )}
      </div>

      <label>
        Nome
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </label>
      <label>
        De
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          disabled={busy}
        />
      </label>
      <label>
        Até
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} disabled={busy} />
      </label>
      <label>
        Órbita
        <select
          value={orbit}
          onChange={(e) => setOrbit(e.target.value as "ASC" | "DESC")}
          disabled={busy}
        >
          <option value="DESC">DESC</option>
          <option value="ASC">ASC</option>
        </select>
      </label>
      <button
        type="button"
        className="btn-primary"
        disabled={!ready || !projectId || busy}
        onClick={() => void run()}
      >
        {busy ? "A processar…" : "Executar pipeline S1"}
      </button>
      {jobStatus && (
        <p className="insar-job-status" role="status">
          Estado job: <code>{jobStatus}</code>
        </p>
      )}
      {message && <p className="las-ok">{message}</p>}
      {error && <p className="las-error">{error}</p>}

      <div className="insar-log-box">
        <div className="insar-log-head">Log detalhado (servidor)</div>
        {pipelineLog.length === 0 ? (
          <p className="insar-log-empty">
            Corra o pipeline para ver passos (Copernicus, download SLC, SNAP,
            GeoTIFF, Cesium).
          </p>
        ) : (
          <pre className="insar-log-pre" tabIndex={0}>
            {pipelineLog.map((s, i) => (
              <span
                key={`${s.at}-${s.step}-${i}`}
                className={s.ok ? "insar-log-line insar-log-line--ok" : "insar-log-line insar-log-line--bad"}
              >
                {formatStageLine(s)}
                {"\n"}
              </span>
            ))}
            <div ref={logEndRef} />
          </pre>
        )}
      </div>
    </section>
  );
}
