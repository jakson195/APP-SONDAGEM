"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  mapLocationCaptionLines,
  type MapLocationCaption,
} from "@/lib/map-location-caption";
import {
  loadMapPdfDataUrl,
  MAP_PDF_HEIGHT,
  MAP_PDF_WIDTH,
} from "@/lib/map-pdf-data-url";

const PDF_BORDER = "2px solid #000000";

type Props = {
  lat: number;
  lng: number;
  zoom?: number;
  furoCodigo?: string;
  furoDescricao?: string;
};

/**
 * Mapa estático no relatório PDF — imagem em data URL (compatível com html2canvas).
 */
export function SptPdfStaticMap({
  lat,
  lng,
  zoom = 16,
  furoCodigo,
  furoDescricao,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const caption: MapLocationCaption = useMemo(
    () => ({
      titulo: furoCodigo?.trim() || "Furo",
      descricao: furoDescricao?.trim() || undefined,
      lat,
      lng,
    }),
    [furoCodigo, furoDescricao, lat, lng],
  );

  const captionLines = useMemo(
    () => mapLocationCaptionLines(caption),
    [caption],
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setDataUrl(null);

    void loadMapPdfDataUrl(lat, lng, zoom, caption).then((url) => {
      if (cancelled) return;
      if (url && url.startsWith("data:image/")) {
        setDataUrl(url);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, zoom, caption]);

  const boxStyle: CSSProperties = {
    marginTop: "6px",
    border: PDF_BORDER,
    padding: "4px",
    backgroundColor: "#ffffff",
    position: "relative",
    width: "100%",
    maxWidth: MAP_PDF_WIDTH,
    minHeight: MAP_PDF_HEIGHT,
  };

  const captionStyle: CSSProperties = {
    position: "absolute",
    left: 12,
    bottom: 10,
    zIndex: 5,
    maxWidth: "calc(100% - 24px)",
    padding: "8px 10px",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.94)",
    border: "1px solid #cbd5e1",
    fontSize: "11px",
    lineHeight: 1.35,
    color: "#0f172a",
    textAlign: "left",
    pointerEvents: "none",
  };

  if (status === "error") {
    return (
      <div
        data-spt-pdf-map-status="error"
        style={{
          ...boxStyle,
          fontSize: "7px",
          color: "#6b7280",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px",
        }}
      >
        Não foi possível gerar o mapa. Defina o pino no mapa de campo e recarregue
        a página.
      </div>
    );
  }

  return (
    <div
      data-spt-pdf-map-status={status === "ready" ? "ready" : "loading"}
      style={boxStyle}
    >
      {status === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "7px",
            color: "#6b7280",
            zIndex: 2,
            backgroundColor: "#f8fafc",
          }}
        >
          A carregar mapa de localização…
        </div>
      )}

      {dataUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt={`Mapa de localização — ${caption.titulo}`}
            width={MAP_PDF_WIDTH}
            height={MAP_PDF_HEIGHT}
            data-spt-pdf-map-img
            data-spt-static-map="img"
            decoding="sync"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              minHeight: MAP_PDF_HEIGHT,
              verticalAlign: "top",
            }}
            onLoad={(e) => {
              const img = e.currentTarget;
              img.dataset.sptStaticMapReady = "1";
              setStatus("ready");
            }}
          />
          <div style={captionStyle} aria-hidden>
            {captionLines.map((line, i) => (
              <div
                key={line}
                style={{
                  fontWeight: i === 0 ? 700 : 400,
                  fontSize: i === 0 ? "12px" : "11px",
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
