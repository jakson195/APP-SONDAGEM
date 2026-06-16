import { useCallback, useState } from "react";
import { getApiBase } from "../lib/api-base";

type ExportOpts = {
  layers: string[];
  format: "geojson" | "kml" | "shp";
  bbox?: [number, number, number, number];
  polygon?: [number, number][];
};

export function useExport() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const preview = useCallback(async (opts: ExportOpts) => {
    const res = await fetch(`${getApiBase()}/export/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) throw new Error("Pré-visualização falhou");
    return res.json() as Promise<{ total: number; layers: Record<string, number> }>;
  }, []);

  const download = useCallback(async (opts: ExportOpts) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${getApiBase()}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail ?? "Exportação falhou");
      }
      const blob = await res.blob();
      const ext = opts.format === "shp" ? "zip" : opts.format;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hidrogeo-export.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Download iniciado");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, message, preview, download };
}
