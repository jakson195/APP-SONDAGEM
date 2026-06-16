import { useCallback, useEffect, useState } from "react";

import {
  fetchInsarRasterDetail,
  insarGeotiffUrl,
  listInsarRasters,
  type InsarRaster,
} from "../../api/insar";
import {
  DEFAULT_DEFORMATION_THRESHOLDS,
  LEGEND_STOPS,
} from "../../cesium/insar/colormap";
import { useCesium } from "../../context/CesiumContext";

interface Props {
  projectId: string | null;
}

export function InsarOverlayPanel({ projectId }: Props) {
  const { layerManager, ready, currentEpoch } = useCesium();
  const [rasters, setRasters] = useState<InsarRaster[]>([]);
  const [opacity, setOpacity] = useState(0.78);
  const [stableMm, setStableMm] = useState(DEFAULT_DEFORMATION_THRESHOLDS.stableMaxMm);
  const [criticalMm, setCriticalMm] = useState(DEFAULT_DEFORMATION_THRESHOLDS.criticalMinMm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);

  const refreshList = useCallback(() => {
    if (!projectId) {
      setRasters([]);
      return;
    }
    listInsarRasters(projectId, undefined, "displacement")
      .then((d) => setRasters(d.items))
      .catch(() => setRasters([]));
  }, [projectId]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (!layerManager) return;
    setOpacity(layerManager.getInsarGlobalOpacity());
    const t = layerManager.getInsarThresholds();
    setStableMm(t.stableMaxMm);
    setCriticalMm(t.criticalMinMm);
  }, [layerManager]);

  const onOpacity = (v: number) => {
    setOpacity(v);
    layerManager?.setInsarGlobalOpacity(v);
  };

  const applyThresholds = () => {
    void layerManager?.setInsarThresholds({
      stableMaxMm: stableMm,
      criticalMinMm: criticalMm,
    });
    setMessage("Colormap atualizado");
  };

  const loadDisplacementRasters = async () => {
    if (!projectId || !layerManager) return;
    setBusy(true);
    setError(null);
    setMessage("A carregar GeoTIFF…");
    try {
      const all = await listInsarRasters(projectId);
      const targets = all.items.filter((r) => r.raster_kind === "displacement");
      if (targets.length === 0) {
        setMessage("Sem rasters displacement — execute o pipeline InSAR primeiro");
        return;
      }
      let n = 0;
      for (const r of targets) {
        await layerManager.addInsarGeotiff({
          name: `InSAR ${r.epoch_date ?? r.raster_kind}`,
          geotiffUrl: insarGeotiffUrl(projectId, r.id),
          epochDate: r.epoch_date ?? undefined,
          rasterKind: "displacement",
          opacity,
          thresholds: { stableMaxMm: stableMm, criticalMinMm: criticalMm },
          flyTo: n === 0,
        });
        n += 1;
      }
      const vel = all.items.find((x) => x.raster_kind === "velocity");
      if (vel) {
        await layerManager.addInsarGeotiff({
          name: "Velocidade InSAR",
          geotiffUrl: insarGeotiffUrl(projectId, vel.id),
          rasterKind: "velocity",
          opacity: opacity * 0.85,
          thresholds: { stableMaxMm: stableMm, criticalMinMm: criticalMm },
        });
        n += 1;
      }
      setLoadedCount(n);
      setMessage(`${n} overlay(s) InSAR no mapa`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar GeoTIFF");
    } finally {
      setBusy(false);
    }
  };

  const loadSingle = async (r: InsarRaster) => {
    if (!projectId || !layerManager) return;
    setBusy(true);
    setError(null);
    try {
      await fetchInsarRasterDetail(projectId, r.id);
      await layerManager.addInsarGeotiff({
        name: `${r.raster_kind} ${r.epoch_date ?? ""}`.trim(),
        geotiffUrl: insarGeotiffUrl(projectId, r.id),
        epochDate: r.epoch_date ?? undefined,
        rasterKind: r.raster_kind as "displacement" | "velocity",
        opacity,
        flyTo: true,
      });
      setMessage(`Carregado: ${r.epoch_date ?? r.id.slice(0, 8)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="insar-overlay-panel">
      <h3>Overlay InSAR</h3>
      <p className="las-hint">GeoTIFF · heatmap · timeline</p>

      <div className="insar-legend" aria-hidden>
        {LEGEND_STOPS.map((s) => (
          <span key={s.label} className="insar-legend-item">
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <label className="insar-control">
        Transparência
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => onOpacity(Number(e.target.value))}
          disabled={!ready}
        />
        <span className="insar-value">{Math.round(opacity * 100)}%</span>
      </label>

      <label className="insar-control">
        Estável até (mm)
        <input
          type="number"
          min={0}
          step={1}
          value={stableMm}
          onChange={(e) => setStableMm(Number(e.target.value))}
          disabled={!ready}
        />
      </label>

      <label className="insar-control">
        Crítico desde (mm)
        <input
          type="number"
          min={1}
          step={1}
          value={criticalMm}
          onChange={(e) => setCriticalMm(Number(e.target.value))}
          disabled={!ready}
        />
      </label>

      <button
        type="button"
        className="btn-secondary"
        disabled={!ready}
        onClick={applyThresholds}
      >
        Aplicar colormap
      </button>

      <button
        type="button"
        className="btn-primary"
        disabled={!ready || !projectId || busy}
        onClick={() => void loadDisplacementRasters()}
      >
        {busy ? "A carregar…" : "Carregar heatmaps"}
      </button>

      {currentEpoch && (
        <p className="insar-epoch-hint">
          Timeline: <strong>{currentEpoch}</strong> (época ativa)
        </p>
      )}

      {loadedCount > 0 && (
        <p className="las-ok">{loadedCount} camada(s) InSAR</p>
      )}

      {rasters.length > 0 && (
        <ul className="insar-raster-pick">
          {rasters.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void loadSingle(r)}
                title={r.download_url}
              >
                {r.epoch_date ?? r.id.slice(0, 8)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="las-ok">{message}</p>}
      {error && <p className="las-error">{error}</p>}
    </section>
  );
}
