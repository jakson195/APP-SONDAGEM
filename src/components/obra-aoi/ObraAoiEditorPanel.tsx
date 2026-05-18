"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Polygon } from "geojson";
import { Layers, Radar, Trash2 } from "lucide-react";

import { ModuleSuspenseFallback } from "@/layouts/module-suspense";
import { apiUrl } from "@/lib/api-url";
import { geoJsonPolygonToWkt } from "@/lib/geojson-polygon-wkt";
import {
  leafletVerticesToPolygon,
  polygonToLeafletVertices,
  type LeafletLatLng,
} from "@/lib/obra-aoi-leaflet";
import { polygonCentroidLngLat } from "@/lib/obra-aoi-polygon";
import { scalePolygonAroundCentroid } from "@/lib/obra-aoi-scale";
import { DIGITAL_TWIN_BASE } from "@/modules/registry";

import { ObraAoiLeafletEditor } from "@/lib/mapa";

import dynamic from "next/dynamic";

const ObraNovaCesiumPreview = dynamic(
  () =>
    import("@/components/obra-nova/ObraNovaCesiumPreview").then((m) => ({
      default: m.ObraNovaCesiumPreview,
    })),
  {
    ssr: false,
    loading: () => (
      <ModuleSuspenseFallback label="A carregar pré-visualização 3D…" />
    ),
  },
);

type ObraAoiApi = {
  id: number;
  nome: string;
  latitude: number | null;
  longitude: number | null;
  areaOfInterestGeojson?: Polygon | null;
};

export function ObraAoiEditorPanel({
  obraId,
  initialObra,
  onSaved,
}: {
  obraId: number;
  initialObra: ObraAoiApi | null;
  onSaved?: (patch: { areaOfInterestGeojson: Polygon | null }) => void;
}) {
  const [vertices, setVertices] = useState<LeafletLatLng[]>([]);
  const [aoiPolygon, setAoiPolygon] = useState<Polygon | null>(null);
  const [editing, setEditing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [show3d, setShow3d] = useState(false);
  const [scalePct, setScalePct] = useState(100);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const applyPolygon = useCallback((poly: Polygon | null) => {
    if (!poly) {
      setAoiPolygon(null);
      setVertices([]);
      setScalePct(100);
      return;
    }
    setAoiPolygon(poly);
    setVertices(polygonToLeafletVertices(poly));
    setScalePct(100);
  }, []);

  useEffect(() => {
    const poly = initialObra?.areaOfInterestGeojson ?? null;
    applyPolygon(poly);
    setDirty(false);
    setEditing(false);
    setDrawing(false);
  }, [initialObra?.areaOfInterestGeojson, applyPolygon]);

  const mapCenter = useMemo<LeafletLatLng>(() => {
    if (aoiPolygon) {
      const c = polygonCentroidLngLat(aoiPolygon);
      return [c.lat, c.lng];
    }
    const lat = initialObra?.latitude;
    const lng = initialObra?.longitude;
    if (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      return [lat, lng];
    }
    return [-15.75, -47.75];
  }, [aoiPolygon, initialObra?.latitude, initialObra?.longitude]);

  const latN = aoiPolygon
    ? polygonCentroidLngLat(aoiPolygon).lat
    : (initialObra?.latitude ?? null);
  const lngN = aoiPolygon
    ? polygonCentroidLngLat(aoiPolygon).lng
    : (initialObra?.longitude ?? null);

  function markDirty() {
    setDirty(true);
    setOkMsg(null);
  }

  function onAddVertex(lat: number, lng: number) {
    if (!drawing || aoiPolygon) return;
    setVertices((prev) => [...prev, [lat, lng]]);
    markDirty();
  }

  const onVertexMove = useCallback((index: number, lat: number, lng: number) => {
    setVertices((prev) => {
      const next = [...prev];
      next[index] = [lat, lng];
      const poly = leafletVerticesToPolygon(next);
      if (poly) setAoiPolygon(poly);
      return next;
    });
    markDirty();
  }, []);

  function fecharPoligono() {
    setErro(null);
    const poly = leafletVerticesToPolygon(vertices);
    if (!poly || !geoJsonPolygonToWkt(poly)) {
      setErro("Polígono inválido: mínimo 3 vértices.");
      return;
    }
    applyPolygon(poly);
    setDrawing(false);
    setEditing(true);
    markDirty();
  }

  function startEditVertices() {
    if (!aoiPolygon) return;
    setVertices(polygonToLeafletVertices(aoiPolygon));
    setEditing(true);
    setDrawing(false);
    setErro(null);
  }

  function startRedraw() {
    setVertices([]);
    setAoiPolygon(null);
    setDrawing(true);
    setEditing(false);
    setScalePct(100);
    markDirty();
  }

  function limparAoi() {
    setVertices([]);
    setAoiPolygon(null);
    setDrawing(false);
    setEditing(false);
    setScalePct(100);
    markDirty();
  }

  function aplicarEscala() {
    if (!aoiPolygon) return;
    const factor = scalePct / 100;
    const scaled = scalePolygonAroundCentroid(aoiPolygon, factor);
    applyPolygon(scaled);
    markDirty();
  }

  async function guardarAoi() {
    setErro(null);
    setOkMsg(null);
    if (!aoiPolygon || !geoJsonPolygonToWkt(aoiPolygon)) {
      setErro("Defina um polígono válido antes de guardar.");
      return;
    }
    setSaving(true);
    try {
      const c = polygonCentroidLngLat(aoiPolygon);
      const r = await fetch(apiUrl(`/api/obras/${obraId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aoi_geojson: aoiPolygon,
          latitude: c.lat,
          longitude: c.lng,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(
          typeof data.error === "string"
            ? data.error
            : "Erro ao guardar área de interesse",
        );
        return;
      }
      const saved =
        (data as { areaOfInterestGeojson?: Polygon }).areaOfInterestGeojson ??
        aoiPolygon;
      applyPolygon(saved);
      setDirty(false);
      setEditing(false);
      setDrawing(false);
      setOkMsg("Área de interesse guardada.");
      onSaved?.({ areaOfInterestGeojson: saved });
    } catch {
      setErro("Falha de rede ao guardar.");
    } finally {
      setSaving(false);
    }
  }

  const hasAoi = aoiPolygon != null && vertices.length >= 3;

  return (
    <section className="mb-8 rounded-2xl border border-teal-500/30 bg-[var(--card)] p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Layers className="h-5 w-5 text-teal-600" />
            Área de interesse (AOI)
          </h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Edite o polígono: arraste os vértices, redesenhe ou use o slider de
            escala. O mapa 3D só carrega se pedir (evita travar a página).
          </p>
        </div>
        <Link
          href={`${DIGITAL_TWIN_BASE}/insar?obraId=${obraId}`}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-teal-600 hover:bg-[var(--surface)] dark:text-teal-400"
        >
          <Radar className="h-3.5 w-3.5" />
          Abrir InSAR
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startEditVertices}
          disabled={!hasAoi || drawing}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-45"
        >
          {editing ? "A editar vértices" : "Editar vértices"}
        </button>
        <button
          type="button"
          onClick={startRedraw}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--surface)]"
        >
          Redesenhar
        </button>
        <button
          type="button"
          onClick={fecharPoligono}
          disabled={vertices.length < 3 || !!aoiPolygon || !drawing}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-45"
        >
          Fechar polígono
        </button>
        <button
          type="button"
          onClick={limparAoi}
          disabled={vertices.length === 0 && !aoiPolygon}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--surface)] disabled:opacity-45"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Limpar
        </button>
        <button
          type="button"
          onClick={() => void guardarAoi()}
          disabled={saving || !dirty || !hasAoi}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-45"
        >
          {saving ? "A guardar…" : "Guardar AOI"}
        </button>
        {hasAoi && (
          <button
            type="button"
            onClick={() => setShow3d((v) => !v)}
            className="rounded-lg border border-violet-500/40 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-violet-300"
          >
            {show3d ? "Ocultar vista 3D" : "Mostrar vista 3D"}
          </button>
        )}
      </div>

      {hasAoi && (
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs">
            <span className="font-medium text-[var(--muted)]">
              Tamanho da área ({scalePct}%)
            </span>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={scalePct}
              onChange={(e) => setScalePct(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <button
            type="button"
            onClick={aplicarEscala}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-semibold hover:bg-[var(--surface)]"
          >
            Aplicar escala
          </button>
        </div>
      )}

      {erro && (
        <p className="mb-2 text-sm text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      )}
      {okMsg && (
        <p className="mb-2 text-sm text-teal-700 dark:text-teal-300" role="status">
          {okMsg}
        </p>
      )}

      <ObraAoiLeafletEditor
        center={mapCenter}
        zoom={hasAoi ? 12 : 6}
        vertices={vertices}
        drawing={drawing}
        editing={editing && hasAoi}
        polygonClosed={hasAoi}
        onAddVertex={onAddVertex}
        onVertexMove={onVertexMove}
      />

      {hasAoi && show3d && (
        <div className="mt-4">
          <ObraNovaCesiumPreview
            polygon={aoiPolygon}
            latitude={latN}
            longitude={lngN}
          />
        </div>
      )}

      {!hasAoi && !drawing && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Esta obra ainda não tem polígono. Use <strong>Redesenhar</strong> para
          criar a área no mapa.
        </p>
      )}
    </section>
  );
}
