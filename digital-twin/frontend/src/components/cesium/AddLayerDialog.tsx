import { useState, type FormEvent } from "react";

import type { LayerManager } from "../../cesium/LayerManager";
import type { LayerKind } from "../../cesium/types";

interface Props {
  layerManager: LayerManager;
  onClose: () => void;
  onAdded: () => void;
}

export function AddLayerDialog({ layerManager, onClose, onAdded }: Props) {
  const [kind, setKind] = useState<LayerKind>("geojson");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [geojsonText, setGeojsonText] = useState("");
  const [rasterMode, setRasterMode] = useState<"xyz" | "wms" | "single">("xyz");
  const [wmsLayers, setWmsLayers] = useState("");
  const [ionAssetId, setIonAssetId] = useState("");
  const [epochFrom, setEpochFrom] = useState("");
  const [epochTo, setEpochTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const temporal =
    epochFrom || epochTo
      ? { epochFrom: epochFrom || undefined, epochTo: epochTo || undefined }
      : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const layerName = name.trim() || "Nova camada";
      if (kind === "geojson") {
        let data: string | GeoJSON.GeoJSON;
        if (geojsonText.trim()) {
          data = JSON.parse(geojsonText) as GeoJSON.GeoJSON;
        } else if (url.trim()) {
          data = url.trim();
        } else {
          throw new Error("Informe URL ou JSON GeoJSON");
        }
        await layerManager.addGeoJson({
          name: layerName,
          data,
          temporal,
          flyTo: true,
        });
      } else if (kind === "3dtiles") {
        const asset = ionAssetId.trim();
        if (asset) {
          await layerManager.add3DTiles({
            name: layerName,
            url: "",
            ionAssetId: Number(asset),
            temporal,
            flyTo: true,
          });
        } else if (url.trim()) {
          await layerManager.add3DTiles({
            name: layerName,
            url: url.trim(),
            temporal,
            flyTo: true,
          });
        } else {
          throw new Error("Informe URL 3D Tiles ou Ion asset ID");
        }
      } else {
        if (!url.trim()) throw new Error("URL do raster obrigatória");
        await layerManager.addRaster({
          name: layerName,
          mode: rasterMode,
          url: url.trim(),
          layers: wmsLayers || undefined,
          temporal,
        });
      }
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao adicionar camada");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="dialog"
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={(e) => void submit(e)}
      >
        <h3>Adicionar camada</h3>

        <label>
          Tipo
          <select value={kind} onChange={(e) => setKind(e.target.value as LayerKind)}>
            <option value="geojson">GeoJSON</option>
            <option value="3dtiles">3D Tiles</option>
            <option value="raster">Raster overlay</option>
          </select>
        </label>

        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: InSAR 2024-06" />
        </label>

        {kind === "geojson" && (
          <>
            <label>
              URL GeoJSON
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://.../data.geojson" />
            </label>
            <label>
              ou JSON inline
              <textarea
                value={geojsonText}
                onChange={(e) => setGeojsonText(e.target.value)}
                rows={4}
                placeholder='{"type":"FeatureCollection",...}'
              />
            </label>
          </>
        )}

        {kind === "3dtiles" && (
          <>
            <label>
              URL tileset.json
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://.../tileset.json" />
            </label>
            <label>
              Cesium Ion asset ID (opcional)
              <input value={ionAssetId} onChange={(e) => setIonAssetId(e.target.value)} placeholder="96188" />
            </label>
          </>
        )}

        {kind === "raster" && (
          <>
            <label>
              Modo
              <select
                value={rasterMode}
                onChange={(e) => setRasterMode(e.target.value as "xyz" | "wms" | "single")}
              >
                <option value="xyz">XYZ tiles</option>
                <option value="wms">WMS</option>
                <option value="single">Imagem única</option>
              </select>
            </label>
            <label>
              URL
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={
                  rasterMode === "xyz"
                    ? "https://.../{z}/{x}/{y}.png"
                    : "https://.../wms"
                }
              />
            </label>
            {rasterMode === "wms" && (
              <label>
                Camadas WMS
                <input value={wmsLayers} onChange={(e) => setWmsLayers(e.target.value)} />
              </label>
            )}
          </>
        )}

        <fieldset className="temporal-fields">
          <legend>Intervalo temporal (opcional)</legend>
          <label>
            De
            <input type="date" value={epochFrom} onChange={(e) => setEpochFrom(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={epochTo} onChange={(e) => setEpochTo(e.target.value)} />
          </label>
        </fieldset>

        {error && <p className="dialog-error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "A carregar…" : "Adicionar"}
          </button>
        </div>
      </form>
    </div>
  );
}
