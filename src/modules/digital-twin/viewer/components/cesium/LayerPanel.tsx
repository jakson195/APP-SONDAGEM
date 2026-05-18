import { useCallback, useEffect, useState } from "react";

import { useCesium } from "../../context/CesiumContext";
import type { LayerKind, LayerRecord } from "../../cesium/types";
import { AddLayerDialog } from "./AddLayerDialog";
import { AlertsPanel } from "./AlertsPanel";
import { PredictionPanel } from "./PredictionPanel";
import { InsarOverlayPanel } from "./InsarOverlayPanel";
import { InsarProcessingPanel } from "./InsarProcessingPanel";
import { LasUploadPanel } from "./LasUploadPanel";

export function LayerPanel({
  viewerMode,
}: {
  viewerMode?: "full" | "insar" | "lidar";
}) {
  const { layerManager, ready, projectId } = useCesium();
  const [layers, setLayers] = useState<LayerRecord[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(() => {
    if (layerManager) setLayers(layerManager.list());
  }, [layerManager]);

  useEffect(() => {
    if (!layerManager) return;
    refresh();
    return layerManager.subscribe(refresh);
  }, [layerManager, refresh]);

  const toggle = (id: string, visible: boolean) => {
    layerManager?.setVisible(id, visible);
  };

  const onOpacity = (id: string, value: number) => {
    layerManager?.setOpacity(id, value);
  };

  const remove = (id: string) => {
    void layerManager?.remove(id);
  };

  const flyTo = (id: string) => {
    void layerManager?.flyToLayer(id);
  };

  return (
    <aside className="layer-panel">
      <header className="panel-header">
        <h2>{viewerMode === "insar" ? "Camadas · InSAR" : "Camadas"}</h2>
        <button
          type="button"
          className="btn-primary"
          disabled={!ready}
          onClick={() => setDialogOpen(true)}
        >
          + Adicionar
        </button>
      </header>

      <LasUploadPanel projectId={projectId} />
      <InsarProcessingPanel projectId={projectId} />
      <InsarOverlayPanel projectId={projectId} />
      <AlertsPanel projectId={projectId} />
      <PredictionPanel projectId={projectId} />

      <ul className="layer-list">
        {layers.length === 0 && (
          <li className="layer-empty">
            Nenhuma camada. Adicione GeoJSON, 3D Tiles ou raster.
          </li>
        )}
        {layers.map((layer) => (
          <li key={layer.id} className="layer-item" data-kind={layer.kind}>
            <div className="layer-row">
              <label className="layer-check">
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={(e) => toggle(layer.id, e.target.checked)}
                />
                <span className="layer-name" title={layer.source}>
                  {layer.name}
                </span>
              </label>
              <span className="layer-badge">{kindLabel(layer.kind)}</span>
            </div>
            <div className="layer-actions">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={layer.opacity}
                onChange={(e) => onOpacity(layer.id, Number(e.target.value))}
                title="Opacidade"
              />
              <button type="button" onClick={() => flyTo(layer.id)} title="Fly to">
                ◎
              </button>
              <button type="button" onClick={() => remove(layer.id)} title="Remover">
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>

      {dialogOpen && layerManager && (
        <AddLayerDialog
          layerManager={layerManager}
          onClose={() => setDialogOpen(false)}
          onAdded={refresh}
        />
      )}
    </aside>
  );
}

function kindLabel(kind: LayerKind): string {
  switch (kind) {
    case "geojson":
      return "GeoJSON";
    case "3dtiles":
      return "3D Tiles";
    case "raster":
      return "Raster";
    case "insar":
      return "InSAR";
  }
}
