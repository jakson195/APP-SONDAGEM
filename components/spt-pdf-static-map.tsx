"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-url";

const PDF_BORDER = "2px solid #000000";

type Props = {
  lat: number;
  lng: number;
  zoom?: number;
};

/**
 * Mapa para o relatório SPT: obtém PNG via /api/map-location e converte para data URL
 * para o html2canvas capturar de forma fiável no PDF.
 */
export function SptPdfStaticMap({ lat, lng, zoom = 16 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = apiUrl(
      `/api/map-location?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}&zoom=${zoom}`,
    );
    setDataUrl(null);
    setFailed(false);

    void fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const t = blob.type || "";
        const okType =
          t.startsWith("image/") ||
          t === "application/octet-stream" ||
          t === "";
        if (!okType || blob.size < 32) throw new Error("not image");
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!cancelled && typeof reader.result === "string") {
            setDataUrl(reader.result);
          }
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

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

  if (failed && !dataUrl) {
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
        Mapa de localização indisponível (ativar Maps Static API e chave no servidor).
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        data-spt-pdf-map-status="loading"
        style={{
          ...boxStyle,
          fontSize: "7px",
          color: "#6b7280",
          minHeight: "120px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        A carregar mapa de localização…
      </div>
    );
  }

  return (
    <div data-spt-pdf-map-status="ready" style={boxStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-spt-static-map
        src={dataUrl}
        alt="Mapa de localização WGS84"
        style={{
          width: "100%",
          maxWidth: "640px",
          height: "auto",
          display: "block",
        }}
      />
    </div>
  );
}
