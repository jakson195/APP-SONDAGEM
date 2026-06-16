import { useMapToolsStore } from "../../store/mapToolsStore";
import { useMeasurement } from "../../hooks/useMeasurement";
import { useExport } from "../../hooks/useExport";
import { useLocationMap } from "../../hooks/useLocationMap";
import { useKmlImport } from "../../hooks/useKmlImport";
import { useEffect } from "react";
import type { ReactNode } from "react";
import type { OutletBasinResult } from "../../types/outlet-basin";

function downloadBasinGeoJson(result: OutletBasinResult) {
  if (!result.basin?.geometry) return;
  const fc = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: result.basin.name,
          code: result.basin.code,
          area_km2: result.basin.area_km2,
        },
        geometry: result.basin.geometry,
      },
    ],
  };
  const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bacia-exutorio-${result.basin.code ?? result.basin.id}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MeasureToolbar() {
  const {
    measureMode,
    measurePoints,
    measureLabel,
    exportPolygon,
    exportLayers,
    exportFormat,
    outletBasin,
    outletLoading,
    locationMapTitle,
    locationMapLoading,
    locationMapIncludeAutoLegend,
    locationMapCustomLegend,
    setLocationMapTitle,
    setLocationMapIncludeAutoLegend,
    setLocationMapCustomLegend,
    setMeasureMode,
    clearMeasure,
    setExportLayers,
    setExportFormat,
    setImportedLayerVisible,
    geologyChatOpen,
    toggleGeologyChat,
  } = useMapToolsStore();
  const { compute } = useMeasurement();
  const { download, loading, message, preview } = useExport();
  const { generate: generateLocationMap } = useLocationMap();
  const { inputRef, openFilePicker, handleFile, removeImportedLayer, importedLayers } = useKmlImport();

  useEffect(() => {
    compute();
  }, [measurePoints, measureMode, compute]);

  const finishExportArea = async () => {
    const poly = exportPolygon.length >= 3 ? exportPolygon : measurePoints;
    if (poly.length < 3) return;
    try {
      const info = await preview({
        layers: exportLayers,
        format: exportFormat,
        polygon: poly,
      });
      if (info.total === 0) {
        alert("Nenhum elemento na área");
        return;
      }
      await download({ layers: exportLayers, format: exportFormat, polygon: poly });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro");
    }
  };

  const finishLocationMap = async () => {
    const poly =
      exportPolygon.length >= 3
        ? exportPolygon
        : measurePoints.length >= 3
          ? measurePoints
          : undefined;
    try {
      await generateLocationMap(poly);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao gerar mapa");
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-14 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".kml,.kmz"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl border border-white/10 bg-[#0c1220]/90 px-2 py-2 shadow-xl backdrop-blur-md">
        <ToolBtn
          active={measureMode === "distance"}
          onClick={() => setMeasureMode(measureMode === "distance" ? "none" : "distance")}
          title="Medir distância"
        >
          📏 Distância
        </ToolBtn>
        <ToolBtn
          active={measureMode === "area"}
          onClick={() => setMeasureMode(measureMode === "area" ? "none" : "area")}
          title="Medir área"
        >
          ⬠ Área
        </ToolBtn>
        <ToolBtn
          active={measureMode === "outlet"}
          onClick={() => setMeasureMode(measureMode === "outlet" ? "none" : "outlet")}
          title="Definir bacia por ponto exutório"
        >
          🎯 Exutório
        </ToolBtn>
        <ToolBtn
          active={measureMode === "locationMap"}
          onClick={() => setMeasureMode(measureMode === "locationMap" ? "none" : "locationMap")}
          title="Gerar mapa de localização com legenda"
        >
          🗺️ Mapa loc.
        </ToolBtn>
        <ToolBtn
          active={false}
          onClick={openFilePicker}
          title="Importar KML ou KMZ"
        >
          📁 KML/KMZ
        </ToolBtn>
        <ToolBtn
          active={measureMode === "export"}
          onClick={() => setMeasureMode(measureMode === "export" ? "none" : "export")}
          title="Seleccionar área para exportar"
        >
          📦 Exportar
        </ToolBtn>
        <ToolBtn
          active={geologyChatOpen}
          onClick={toggleGeologyChat}
          title="Terminal de geologia com IA — arraste o painel para posicionar"
        >
          🪨 Geologia IA
        </ToolBtn>
        <button
          type="button"
          onClick={clearMeasure}
          className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white"
        >
          Limpar
        </button>
      </div>

      {measureLabel && measureMode !== "export" && (
        <p className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-100">
          {measureLabel}
        </p>
      )}

      {measureMode === "outlet" && (
        <div className="w-80 rounded-xl border border-sky-500/30 bg-[#0c1220]/95 p-3 text-xs text-slate-300 backdrop-blur-md">
          <p className="mb-1 font-medium text-sky-200">Bacia por exutório</p>
          <p className="mb-2 text-slate-400">
            Clique no mapa na foz ou num curso d&apos;água. O ponto ajusta-se ao rio mais próximo (até 2,5 km).
          </p>
          {outletLoading && <p className="text-sky-300">A calcular bacia…</p>}
          {outletBasin?.found && outletBasin.basin && (
            <div className="space-y-1 border-t border-white/10 pt-2">
              <p className="font-medium text-slate-100">{outletBasin.basin.name}</p>
              <p>
                Área:{" "}
                {(outletBasin.basin.sub_area_km2 ?? outletBasin.basin.area_km2)?.toLocaleString("pt-BR", {
                  maximumFractionDigits: 0,
                })}{" "}
                km²
              </p>
              {outletBasin.river?.name && (
                <p className="text-slate-400">Curso: {outletBasin.river.name}</p>
              )}
              <button
                type="button"
                onClick={() => downloadBasinGeoJson(outletBasin)}
                className="mt-2 w-full rounded-lg bg-sky-600 py-1.5 text-white hover:bg-sky-500"
              >
                Descarregar GeoJSON
              </button>
            </div>
          )}
          {outletBasin && !outletBasin.found && (
            <p className="text-amber-200">{outletBasin.message}</p>
          )}
        </div>
      )}

      {measureMode === "locationMap" && (
        <div className="w-96 max-h-[70vh] overflow-y-auto rounded-xl border border-amber-500/30 bg-[#0c1220]/95 p-3 text-xs text-slate-300 backdrop-blur-md">
          <p className="mb-1 font-medium text-amber-200">Mapa de localização</p>
          <p className="mb-2 text-slate-400">
            Ajuste zoom e extensão no mapa. O PNG captura a vista actual. Opcionalmente delimite a área
            (≥3 pontos) para marcar a área de estudo.
          </p>
          <label className="mb-2 block">
            Título
            <input
              type="text"
              value={locationMapTitle}
              onChange={(e) => setLocationMapTitle(e.target.value)}
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-slate-100"
            />
          </label>
          <label className="mb-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={locationMapIncludeAutoLegend}
              onChange={(e) => setLocationMapIncludeAutoLegend(e.target.checked)}
            />
            Incluir camadas activas na legenda
          </label>
          <label className="mb-2 block">
            Legenda personalizada
            <span className="mt-0.5 block text-[10px] text-slate-500">
              Uma linha por item: Rótulo · Rótulo;#ff0000 · Rótulo;#00aa00;fill · Rótulo;#0000ff;point
            </span>
            <textarea
              value={locationMapCustomLegend}
              onChange={(e) => setLocationMapCustomLegend(e.target.value)}
              rows={4}
              placeholder={"Zona urbana;#888888;fill\nEstrada;#333333;line\nPoço;#0066cc;point"}
              className="mt-1 w-full resize-y rounded border border-white/10 bg-black/30 px-2 py-1 font-mono text-[11px] text-slate-100"
            />
          </label>
          <p className="mb-2 text-slate-500">
            Vértices da área (opcional): {exportPolygon.length || measurePoints.length}
          </p>
          <button
            type="button"
            disabled={locationMapLoading}
            onClick={() => void finishLocationMap()}
            className="w-full rounded-lg bg-amber-600 py-1.5 text-white hover:bg-amber-500 disabled:opacity-40"
          >
            {locationMapLoading ? "A gerar PNG…" : "Gerar mapa PNG (vista actual)"}
          </button>
        </div>
      )}

      {importedLayers.length > 0 && (
        <div className="w-72 rounded-xl border border-orange-500/25 bg-[#0c1220]/95 p-3 text-xs text-slate-300 backdrop-blur-md">
          <p className="mb-2 font-medium text-orange-200">Camadas importadas</p>
          <ul className="space-y-1">
            {importedLayers.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={l.visible}
                    onChange={(e) => setImportedLayerVisible(l.id, e.target.checked)}
                  />
                  <span
                    className="inline-block h-2 w-4 rounded-sm"
                    style={{ backgroundColor: `rgb(${l.color[0]},${l.color[1]},${l.color[2]})` }}
                  />
                  {l.name}
                </label>
                <button
                  type="button"
                  className="text-slate-500 hover:text-red-300"
                  onClick={() => removeImportedLayer(l.id)}
                  aria-label="Remover"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {measureMode === "export" && (
        <div className="w-72 rounded-xl border border-white/10 bg-[#0c1220]/95 p-3 text-xs text-slate-300 backdrop-blur-md">
          <p className="mb-2 text-slate-400">Clique no mapa para definir polígono (≥3 pontos)</p>
          <p className="mb-2">Vértices: {exportPolygon.length || measurePoints.length}</p>
          <label className="mb-1 block">
            Formato
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as "geojson" | "kml" | "shp")}
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1"
            >
              <option value="geojson">GeoJSON</option>
              <option value="kml">KML</option>
              <option value="shp">Shapefile (.zip)</option>
            </select>
          </label>
          <label className="mb-2 block">
            Camadas
            <div className="mt-1 space-y-1">
              {["rivers", "lithology"].map((l) => (
                <label key={l} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportLayers.includes(l)}
                    onChange={(e) => {
                      setExportLayers(
                        e.target.checked
                          ? [...exportLayers, l]
                          : exportLayers.filter((x) => x !== l),
                      );
                    }}
                  />
                  {l === "rivers" ? "Rios" : "Litologia"}
                </label>
              ))}
            </div>
          </label>
          <button
            type="button"
            disabled={loading || (exportPolygon.length < 3 && measurePoints.length < 3)}
            onClick={() => void finishExportArea()}
            className="w-full rounded-lg bg-sky-600 py-1.5 text-white hover:bg-sky-500 disabled:opacity-40"
          >
            {loading ? "A exportar…" : "Descarregar"}
          </button>
          {message && <p className="mt-1 text-[10px] text-sky-300">{message}</p>}
        </div>
      )}

      {measureMode !== "none" && measureMode !== "export" && measureMode !== "outlet" && measureMode !== "locationMap" && (
        <p className="text-[10px] text-slate-500">Clique no mapa para adicionar pontos</p>
      )}
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-xs ${
        active ? "bg-sky-600 text-white" : "text-slate-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
