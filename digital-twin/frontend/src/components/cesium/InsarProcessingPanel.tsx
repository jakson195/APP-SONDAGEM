import { useState } from "react";

import { createInsarJob, insarGeotiffUrl, listInsarRasters, type InsarRaster } from "../../api/insar";
import { useCesium } from "../../context/CesiumContext";

interface Props {
  projectId: string | null;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function InsarProcessingPanel({ projectId }: Props) {
  const { layerManager, ready } = useCesium();
  const [name, setName] = useState("InSAR S1");
  const [dateFrom, setDateFrom] = useState("2024-01-01");
  const [dateTo, setDateTo] = useState("2024-06-30");
  const [orbit, setOrbit] = useState<"DESC" | "ASC">("DESC");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!projectId || !layerManager) return;
    setBusy(true);
    setError(null);
    setMessage("A iniciar pipeline InSAR…");
    try {
      const job = await createInsarJob(projectId, {
        name,
        date_from: dateFrom,
        date_to: dateTo,
        orbit_direction: orbit,
        run_immediately: true,
      });
      setMessage(`Job ${job.id.slice(0, 8)}… ${job.status}`);

      const poll = async (): Promise<InsarRaster[]> => {
        const st = await fetch(
          `${API_BASE}/api/v1/projects/${projectId}/insar/jobs/${job.id}`,
        ).then(
          (r) =>
            r.json() as Promise<{
              status: string;
              properties: { message?: string };
            }>,
        );
        setMessage(st.properties?.message ?? st.status);
        if (st.status === "completed") {
          const rasters = await listInsarRasters(projectId, job.id);
          return rasters.items;
        }
        if (st.status === "failed") throw new Error("Job InSAR falhou");
        await new Promise((r) => setTimeout(r, 2500));
        return poll();
      };

      const rasters = await poll();
      let n = 0;
      for (const r of rasters) {
        if (r.raster_kind !== "displacement" && r.raster_kind !== "velocity") continue;
        await layerManager.addInsarGeotiff({
          name: `${r.raster_kind} ${r.epoch_date ?? ""}`.trim(),
          geotiffUrl: insarGeotiffUrl(projectId, r.id),
          epochDate: r.epoch_date ?? undefined,
          rasterKind: r.raster_kind as "displacement" | "velocity",
          flyTo: n === 0,
        });
        n += 1;
      }
      setMessage(`${n} overlay(s) InSAR com colormap no mapa`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro InSAR");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="insar-panel">
      <h3>InSAR Processing</h3>
      <p className="las-hint">Sentinel-1 → InSAR → GeoTIFF → heatmap Cesium</p>
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
      {message && <p className="las-ok">{message}</p>}
      {error && <p className="las-error">{error}</p>}
    </section>
  );
}
