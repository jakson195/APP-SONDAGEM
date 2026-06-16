import { useRef } from "react";
import * as turf from "@turf/turf";
import { parseKmlOrKmzFile, colorForImportIndex } from "../lib/kml-import";
import { useMapToolsStore } from "../store/mapToolsStore";

export function useKmlImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { importedLayers, addImportedLayer, removeImportedLayer } = useMapToolsStore();

  const openFilePicker = () => inputRef.current?.click();

  const handleFile = async (file: File | null) => {
    if (!file) return;
    try {
      const data = await parseKmlOrKmzFile(file);
      if (!data.features?.length) throw new Error("Ficheiro sem geometrias");

      const baseName = file.name.replace(/\.(kml|kmz)$/i, "");
      const id = `import-${Date.now()}`;
      const color = colorForImportIndex(importedLayers.length);

      addImportedLayer({
        id,
        name: baseName,
        color,
        data,
        visible: true,
      });

      const mapApi = useMapToolsStore.getState().mapCaptureApi;
      if (mapApi && data.features.length > 0) {
        try {
          const fc = turf.featureCollection(data.features);
          const b = turf.bbox(fc);
          await mapApi.fitPolygon(
            [
              [b[0], b[1]],
              [b[2], b[1]],
              [b[2], b[3]],
              [b[0], b[3]],
            ],
            80,
          );
        } catch {
          /* ignore fit errors */
        }
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao importar KML/KMZ");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return { inputRef, openFilePicker, handleFile, removeImportedLayer, importedLayers };
}
