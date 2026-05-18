"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api-url";
import { drawMapLocationTilesOnCanvas } from "@/lib/map-location-tiles-browser";
import { drawMapBlobOntoCanvas } from "@/lib/raster-map-blob-for-pdf";

const PDF_BORDER = "2px solid #000000";

type Props = {
  lat: number;
  lng: number;
  zoom?: number;
};

async function tryDrawWhenCanvasReady(
  blob: Blob,
  getCanvas: () => HTMLCanvasElement | null,
): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  delete canvas.dataset.sptStaticMapReady;
  await drawMapBlobOntoCanvas(blob, canvas);
  canvas.dataset.sptStaticMapReady = "1";
  return true;
}

async function tryDrawTilesInBrowser(
  lat: number,
  lng: number,
  zoom: number,
  getCanvas: () => HTMLCanvasElement | null,
): Promise<boolean> {
  const canvas = getCanvas();
  if (!canvas) return false;
  delete canvas.dataset.sptStaticMapReady;
  const ok = await drawMapLocationTilesOnCanvas(canvas, lat, lng, zoom, true);
  if (ok) canvas.dataset.sptStaticMapReady = "1";
  return ok;
}

/**
 * Mapa para o relatório: imagem servida por /api/map-location, rasterizada num
 * <canvas> (fiável com html2canvas; <img> com data URL costuma falhar).
 */
export function SptPdfStaticMap({ lat, lng, zoom = 16 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    const c0 = canvasRef.current;
    if (c0) {
      delete c0.dataset.sptStaticMapReady;
      const ctx = c0.getContext("2d");
      if (ctx && c0.width > 0 && c0.height > 0) {
        ctx.clearRect(0, 0, c0.width, c0.height);
      }
    }

    const url = apiUrl(
      `/api/map-location?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&zoom=${zoom}`,
    );

    void (async () => {
      let blob: Blob | null = null;
      try {
        const r = await fetch(url);
        if (r.ok) {
          const b = await r.blob();
          const t = b.type || "";
          const okType =
            t.startsWith("image/") ||
            t === "application/octet-stream" ||
            t === "";
          if (okType && b.size >= 32) blob = b;
        }
      } catch {
        blob = null;
      }

      if (cancelled) return;

      if (blob) {
        try {
          let ok = await tryDrawWhenCanvasReady(blob, () => canvasRef.current);
          if (!ok && !cancelled) {
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
            ok = await tryDrawWhenCanvasReady(blob, () => canvasRef.current);
          }
          if (cancelled) return;
          if (ok) {
            setStatus("ready");
            return;
          }
        } catch {
          /* tentar tiles no browser */
        }
      }

      if (cancelled) return;
      try {
        const ok = await tryDrawTilesInBrowser(lat, lng, zoom, () => canvasRef.current);
        if (cancelled) return;
        if (ok) setStatus("ready");
        else setStatus("error");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lat, lng, zoom]);

  const boxStyle: CSSProperties = {
    marginTop: "6px",
    border: PDF_BORDER,
    padding: "4px",
    backgroundColor: "#ffffff",
  };

  if (status === "error") {
    return (
      <div
        data-spt-pdf-map-status="error"
        style={{
          ...boxStyle,
          fontSize: "7px",
          color: "#6b7280",
          minHeight: "72px",
        }}
      >
        Mapa de localização indisponível. Verifique a internet. No telemóvel com a app,
        a URL do servidor (variável NEXT_PUBLIC_APP_URL) tem de apontar para o PC/serviço
        onde corre o Next. Opcional: configurar Google Static Maps no servidor.
      </div>
    );
  }

  return (
    <div data-spt-pdf-map-status={status === "ready" ? "ready" : "loading"} style={boxStyle}>
      {status === "loading" && (
        <div
          style={{
            fontSize: "7px",
            color: "#6b7280",
            minHeight: "48px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          A carregar mapa de localização…
        </div>
      )}
      <canvas
        ref={canvasRef}
        data-spt-static-map
        width={640}
        height={360}
        style={{
          width: "100%",
          maxWidth: "640px",
          height: "auto",
          display: status === "ready" ? "block" : "none",
        }}
      />
    </div>
  );
}
