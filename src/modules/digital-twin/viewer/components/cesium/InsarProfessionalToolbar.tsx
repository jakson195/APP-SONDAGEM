"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { Expand, MapPinned, Minimize2, Radar } from "lucide-react";
import { apiUrl } from "@/lib/api-url";
import type { ProjectSummary } from "../../api/types";
import { flyToPosition, flyToProject } from "../../cesium/flyTo";
import { useCesium } from "../../context/CesiumContext";

type ObraApiResponse = {
  latitude?: number | null;
  longitude?: number | null;
  error?: string;
};

interface Props {
  project: ProjectSummary | null;
  layoutRef: RefObject<HTMLDivElement | null>;
  obraId: number | null;
}

export function InsarProfessionalToolbar({
  project,
  layoutRef,
  obraId,
}: Props) {
  const { viewer, ready, flyTo } = useCesium();
  const [fullscreen, setFullscreen] = useState(false);
  const [obraHint, setObraHint] = useState<string | null>(null);

  useEffect(() => {
    const fn = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = layoutRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* políticas do browser */
    }
  }, [layoutRef]);

  const flyObra = useCallback(async () => {
    if (!viewer || obraId == null) return;
    setObraHint(null);
    try {
      const r = await fetch(apiUrl(`/api/obras/${obraId}`), {
        credentials: "include",
      });
      const data = (await r.json()) as ObraApiResponse;
      if (!r.ok || data.error) {
        setObraHint(
          typeof data.error === "string" ? data.error : "Obra não disponível.",
        );
        return;
      }
      const lat = data.latitude;
      const lng = data.longitude;
      if (
        lat == null ||
        lng == null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        setObraHint(
          "Obra sem coordenadas — defina latitude e longitude na ficha da obra.",
        );
        return;
      }
      flyToPosition(viewer, {
        longitude: lng,
        latitude: lat,
        height: 9500,
        pitch: -58,
        duration: 2.4,
      });
    } catch {
      setObraHint("Falha ao carregar dados da obra.");
    }
  }, [viewer, obraId]);

  const goProjeto = () => {
    if (!viewer || !project) return;
    flyToProject(viewer, project);
  };

  const goDemo = () => {
    flyTo({
      longitude: -47.75,
      latitude: -15.75,
      height: 18500,
      pitch: -52,
      duration: 2,
    });
  };

  return (
    <div className="insar-pro-toolbar">
      <div className="insar-pro-toolbar-row">
        <button
          type="button"
          disabled={!ready || !project}
          onClick={goProjeto}
          title="Centralizar no projeto geoespacial"
        >
          <Radar className="insar-pro-icon" aria-hidden />
          Projeto
        </button>
        <button
          type="button"
          disabled={!ready || obraId == null}
          onClick={() => void flyObra()}
          title="Ir para coordenadas da obra (API)"
        >
          <MapPinned className="insar-pro-icon" aria-hidden />
          Obra
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={goDemo}
          title="Vista regional — Brasil Centro-Oeste"
        >
          Demo
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => void toggleFullscreen()}
          title={
            fullscreen ? "Sair do modo ecrã inteiro" : "Modo ecrã inteiro"
          }
        >
          {fullscreen ? (
            <Minimize2 className="insar-pro-icon" aria-hidden />
          ) : (
            <Expand className="insar-pro-icon" aria-hidden />
          )}
          {fullscreen ? " Janela" : " Ecrã inteiro"}
        </button>
      </div>
      {obraHint ? (
        <p className="insar-pro-toolbar-hint" role="alert">
          {obraHint}
        </p>
      ) : null}
    </div>
  );
}
