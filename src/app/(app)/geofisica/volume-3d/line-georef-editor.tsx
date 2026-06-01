"use client";

import type {
  GeorefCoordMode,
  SectionPoint3D,
  SurveyLineGeometry,
} from "@/lib/geofisica/volume3d/volume3d-types";
import { refreshLineAzimuth } from "@/lib/geofisica/volume3d/line-auto-register";
import {
  formatEndpointLabel,
  geometryStartEndWgs84,
  parseCoordTriple,
  wgs84ToGeometryPoint,
} from "@/lib/geofisica/volume3d/geometry-coords";
import {
  parseUtmPaste,
  utmMetersToWgs84,
  wgs84ToUtmMeters,
  type CoordInputMode,
} from "@/lib/geofisica/volume3d/geophys-utm-coords";

type SharedGeorefProps = {
  geometry: SurveyLineGeometry;
  projectOrigin: SectionPoint3D;
  onChange: (geometry: SurveyLineGeometry) => void;
  coordInputMode?: CoordInputMode;
  utmFuso?: string;
  onUtmFusoChange?: (fuso: string) => void;
  onPickStart?: () => void;
  onPickEnd?: () => void;
  pickTarget?: "start" | "end" | null;
};

type Props = SharedGeorefProps & {
  expanded?: boolean;
  onToggle?: () => void;
  onProjectOriginChange?: (origin: SectionPoint3D) => void;
  onPickTarget?: (target: "start" | "end" | null) => void;
  onCoordInputModeChange?: (mode: CoordInputMode) => void;
  /** Rótulo do KML/KMZ associado a esta secção. */
  assignedKmlLabel?: string | null;
  /** Importar KML/KMZ para georreferir A→B desta linha. */
  onImportKml?: (files: FileList) => void;
};

function applyWgsToGeometry(
  geometry: SurveyLineGeometry,
  projectOrigin: SectionPoint3D,
  which: "start" | "end",
  lat: number,
  lng: number,
  zM: number,
): SurveyLineGeometry {
  const mode = geometry.coordMode ?? "wgs84";
  const point =
    mode === "wgs84"
      ? { x: lat, y: lng, z: zM }
      : wgs84ToGeometryPoint(lat, lng, zM, "project", geometry.projectOrigin ?? projectOrigin);
  return refreshLineAzimuth({
    ...geometry,
    [which]: point,
  });
}

function axisLabels(mode: GeorefCoordMode, inputMode: CoordInputMode): [string, string, string] {
  if (inputMode === "utm") {
    return ["Easting E (m)", "Northing N (m)", "Cota Z (m)"];
  }
  if (mode === "wgs84") {
    return ["Lat (X °)", "Lng (Y °)", "Cota Z (m)"];
  }
  return ["Easting X (m)", "Northing Y (m)", "Cota Z (m)"];
}

function EndpointFields({
  label,
  point,
  mode,
  inputMode,
  utmFuso,
  wgsLat,
  wgsLng,
  onChangeWgs,
  onPick,
  picking,
}: {
  label: string;
  point: SectionPoint3D;
  mode: GeorefCoordMode;
  inputMode: CoordInputMode;
  utmFuso: string;
  wgsLat: number;
  wgsLng: number;
  onChangeWgs: (lat: number, lng: number, z: number) => void;
  onPick?: () => void;
  picking?: boolean;
}) {
  const utm =
    inputMode === "utm"
      ? wgs84ToUtmMeters(wgsLat, wgsLng, utmFuso)
      : null;

  const display =
    inputMode === "utm" && utm
      ? { x: utm.easting, y: utm.northing, z: point.z }
      : mode === "wgs84"
        ? { x: wgsLat, y: wgsLng, z: point.z }
        : { x: point.x, y: point.y, z: point.z };

  const [lx, ly, lz] = axisLabels(mode, inputMode);

  const setField = (key: "x" | "y" | "z", val: number) => {
    if (inputMode === "utm") {
      const e = key === "x" ? val : display.x;
      const n = key === "y" ? val : display.y;
      const z = key === "z" ? val : display.z;
      const wgs = utmMetersToWgs84(n, e, utmFuso);
      if (!wgs) return;
      onChangeWgs(wgs.lat, wgs.lng, z);
      return;
    }
    if (mode === "wgs84") {
      const lat = key === "x" ? val : wgsLat;
      const lng = key === "y" ? val : wgsLng;
      const z = key === "z" ? val : point.z;
      onChangeWgs(lat, lng, z);
      return;
    }
    onChangeWgs(wgsLat, wgsLng, key === "z" ? val : point.z);
  };

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-teal-800 dark:text-teal-300">
          {label}
        </span>
        {onPick && (
          <button
            type="button"
            onClick={onPick}
            className={`rounded px-2 py-0.5 text-[10px] ${
              picking
                ? "bg-teal-600 text-white"
                : "border border-[var(--border)] hover:bg-[var(--surface)]"
            }`}
          >
            {picking ? "Clique no mapa…" : "Mapa"}
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(
          [
            [lx, "x", display.x],
            [ly, "y", display.y],
            [lz, "z", display.z],
          ] as const
        ).map(([lbl, key, val]) => (
          <label key={key} className="text-[10px] text-[var(--muted)]">
            {lbl}
            <input
              type="number"
              step="any"
              value={Number.isFinite(val) ? val : 0}
              onChange={(e) => {
                const n = Number(e.target.value);
                setField(key, Number.isFinite(n) ? n : 0);
              }}
              className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-0.5 text-xs"
            />
          </label>
        ))}
      </div>
      {inputMode === "utm" && utm && (
        <p className="mt-1 text-[9px] text-[var(--muted)]">
          WGS84: {wgsLat.toFixed(6)}°, {wgsLng.toFixed(6)}° · fuso {utm.fuso}
        </p>
      )}
    </div>
  );
}

function CoordInputToolbar({
  coordInputMode,
  utmFuso,
  onCoordInputModeChange,
  onUtmFusoChange,
  compact = false,
}: {
  coordInputMode: CoordInputMode;
  utmFuso: string;
  onCoordInputModeChange?: (mode: CoordInputMode) => void;
  onUtmFusoChange?: (fuso: string) => void;
  compact?: boolean;
}) {
  if (!onCoordInputModeChange) return null;
  return (
    <div
      className={`flex flex-wrap items-end gap-2 ${compact ? "" : "mb-2 pb-2 border-b border-[var(--border)]"}`}
    >
      <label className="text-[10px] text-[var(--muted)]">
        Entrada
        <select
          value={coordInputMode}
          onChange={(e) =>
            onCoordInputModeChange(e.target.value as CoordInputMode)
          }
          className="mt-0.5 block rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
        >
          <option value="wgs84">WGS84 (Lat / Lng)</option>
          <option value="utm">UTM (E / N)</option>
        </select>
      </label>
      {coordInputMode === "utm" && onUtmFusoChange && (
        <label className="text-[10px] text-[var(--muted)]">
          Fuso UTM
          <input
            type="text"
            value={utmFuso}
            onChange={(e) => onUtmFusoChange(e.target.value.toUpperCase())}
            placeholder="22S"
            className="mt-0.5 w-20 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs uppercase"
          />
        </label>
      )}
    </div>
  );
}

/** Campos compactos — WGS84 ou UTM. */
export function LineGeorefInline({
  geometry,
  projectOrigin,
  onChange,
  coordInputMode = "wgs84",
  utmFuso = "22S",
  onPickStart,
  onPickEnd,
  pickTarget,
}: Omit<SharedGeorefProps, "onUtmFusoChange">) {
  const mode = geometry.coordMode ?? "wgs84";
  const wgs = geometryStartEndWgs84(geometry);

  const applyWgs = (
    which: "start" | "end",
    lat: number,
    lng: number,
    zM: number,
  ) => {
    onChange(applyWgsToGeometry(geometry, projectOrigin, which, lat, lng, zM));
  };

  const field = (
    which: "start" | "end",
    label: string,
    color: string,
    wgsPt: { lat: number; lng: number; zM: number },
    onPick?: () => void,
  ) => {
    const utm =
      coordInputMode === "utm"
        ? wgs84ToUtmMeters(wgsPt.lat, wgsPt.lng, utmFuso)
        : null;
    const display =
      coordInputMode === "utm" && utm
        ? [
            ["E (m)", "x", utm.easting],
            ["N (m)", "y", utm.northing],
            ["Z", "z", wgsPt.zM],
          ]
        : [
            ["Lat", "x", wgsPt.lat],
            ["Lng", "y", wgsPt.lng],
            ["Z", "z", wgsPt.zM],
          ];

    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-1">
        <span
          className="shrink-0 text-[10px] font-semibold"
          style={{ color }}
        >
          {label}
        </span>
        {display.map(([lbl, key, val]) => (
          <label
            key={key}
            className="min-w-[72px] flex-1 text-[10px] text-[var(--muted)]"
          >
            {lbl}
            <input
              type="number"
              step="any"
              value={Number.isFinite(val as number) ? (val as number) : 0}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                if (coordInputMode === "utm" && utm) {
                  const easting = key === "x" ? n : utm.easting;
                  const northing = key === "y" ? n : utm.northing;
                  const z = key === "z" ? n : wgsPt.zM;
                  const w = utmMetersToWgs84(northing, easting, utmFuso);
                  if (w) applyWgs(which, w.lat, w.lng, z);
                } else {
                  const lat = key === "x" ? n : wgsPt.lat;
                  const lng = key === "y" ? n : wgsPt.lng;
                  const z = key === "z" ? n : wgsPt.zM;
                  applyWgs(which, lat, lng, z);
                }
              }}
              className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-xs"
            />
          </label>
        ))}
        {onPick && (
          <button
            type="button"
            onClick={onPick}
            className={`mb-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
              pickTarget === which
                ? "bg-teal-600 text-white"
                : "border border-[var(--border)] hover:bg-[var(--surface)]"
            }`}
          >
            Mapa
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mt-2 space-y-1.5 rounded border border-[var(--border)] bg-[var(--bg)]/60 p-2">
      <p className="text-[10px] font-medium text-[var(--muted)]">
        {coordInputMode === "utm"
          ? `Coordenadas UTM (E/N) — fuso ${utmFuso}`
          : "Coordenadas WGS84 (Lat/Lng)"}
      </p>
      <div className="flex flex-col gap-2 lg:flex-row lg:gap-3">
        {field("start", "A", "#16a34a", wgs.start, onPickStart)}
        {field("end", "B", "#dc2626", wgs.end, onPickEnd)}
      </div>
    </div>
  );
}

export function LineGeorefEditor({
  geometry,
  projectOrigin,
  expanded = false,
  onToggle,
  onChange,
  onProjectOriginChange,
  pickTarget,
  onPickTarget,
  coordInputMode = "wgs84",
  utmFuso = "22S",
  onUtmFusoChange,
  onCoordInputModeChange,
  assignedKmlLabel,
  onImportKml,
}: Props) {
  const mode = geometry.coordMode ?? "wgs84";
  const wgs = geometryStartEndWgs84(geometry);

  const setMode = (coordMode: GeorefCoordMode) => {
    onChange(
      refreshLineAzimuth({
        ...geometry,
        coordMode,
        projectOrigin:
          coordMode === "project"
            ? (geometry.projectOrigin ?? projectOrigin)
            : geometry.projectOrigin,
      }),
    );
  };

  const applyWgs = (
    which: "start" | "end",
    lat: number,
    lng: number,
    zM: number,
  ) => {
    onChange(applyWgsToGeometry(geometry, projectOrigin, which, lat, lng, zM));
  };

  const pasteEndpoint = (which: "start" | "end", text: string) => {
    if (!text.trim()) return;
    if (coordInputMode === "utm") {
      const parsed = parseUtmPaste(text, utmFuso);
      if (!parsed) return;
      const w = utmMetersToWgs84(parsed.northing, parsed.easting, utmFuso);
      if (w) applyWgs(which, w.lat, w.lng, parsed.z);
      return;
    }
    const p = parseCoordTriple(text, mode);
    if (!p) return;
    if (mode === "wgs84") {
      applyWgs(which, p.x, p.y, p.z);
    } else {
      onChange(
        refreshLineAzimuth({
          ...geometry,
          [which]: p,
        }),
      );
    }
  };

  if (!expanded) {
    const startLabel =
      coordInputMode === "utm"
        ? (() => {
            const u = wgs84ToUtmMeters(wgs.start.lat, wgs.start.lng, utmFuso);
            return u
              ? `E ${u.easting.toFixed(1)} N ${u.northing.toFixed(1)}`
              : formatEndpointLabel(geometry.start, mode);
          })()
        : formatEndpointLabel(geometry.start, mode);
    const endLabel =
      coordInputMode === "utm"
        ? (() => {
            const u = wgs84ToUtmMeters(wgs.end.lat, wgs.end.lng, utmFuso);
            return u
              ? `E ${u.easting.toFixed(1)} N ${u.northing.toFixed(1)}`
              : formatEndpointLabel(geometry.end, mode);
          })()
        : formatEndpointLabel(geometry.end, mode);

    return (
      <button
        type="button"
        onClick={onToggle}
        className="mt-2 w-full rounded border border-dashed border-teal-600/40 px-2 py-1.5 text-left text-[11px] text-teal-800 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/30"
      >
        Georreferência A→B: {startLabel} → {endLabel}
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-teal-600/30 bg-teal-50/50 p-3 dark:bg-teal-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--text)]">
          Georreferência da secção
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {assignedKmlLabel && (
            <span className="max-w-[180px] truncate text-[10px] text-teal-800 dark:text-teal-300" title={assignedKmlLabel}>
              KML: {assignedKmlLabel}
            </span>
          )}
          {onImportKml && (
            <label className="cursor-pointer rounded border border-teal-600/50 bg-teal-700 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-teal-800">
              Importar KML/KMZ
              <input
                type="file"
                accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
                className="hidden"
                onChange={(e) => {
                  const fs = e.target.files;
                  if (fs?.length) onImportKml(fs);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          <button type="button" onClick={onToggle} className="text-[10px] text-[var(--muted)]">
            Fechar
          </button>
        </div>
      </div>

      <CoordInputToolbar
        coordInputMode={coordInputMode}
        utmFuso={utmFuso}
        onCoordInputModeChange={onCoordInputModeChange}
        onUtmFusoChange={onUtmFusoChange}
      />

      <label className="block text-[10px] text-[var(--muted)]">
        Armazenamento interno
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as GeorefCoordMode)}
          className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
        >
          <option value="wgs84">WGS84 — Lat / Lng / Cota</option>
          <option value="project">Projeto — E / N local (m)</option>
        </select>
      </label>

      {mode === "project" && onProjectOriginChange && (
        <div className="rounded border border-amber-500/30 bg-amber-50/50 p-2 dark:bg-amber-950/20">
          <p className="mb-1 text-[10px] font-medium text-amber-900 dark:text-amber-200">
            Origem do projeto (WGS84 do ponto 0,0)
          </p>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                ["Lat origem", "x", projectOrigin.x],
                ["Lng origem", "y", projectOrigin.y],
                ["Cota origem", "z", projectOrigin.z],
              ] as const
            ).map(([lbl, key, val]) => (
              <label key={key} className="text-[10px] text-[var(--muted)]">
                {lbl}
                <input
                  type="number"
                  step="any"
                  value={val}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    onProjectOriginChange({
                      ...projectOrigin,
                      [key]: Number.isFinite(n) ? n : 0,
                    });
                  }}
                  className="mt-0.5 w-full rounded border px-1 py-0.5 text-xs"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <EndpointFields
        label="Ponto A — início"
        point={geometry.start}
        mode={mode}
        inputMode={coordInputMode}
        utmFuso={utmFuso}
        wgsLat={wgs.start.lat}
        wgsLng={wgs.start.lng}
        onChangeWgs={(lat, lng, z) => applyWgs("start", lat, lng, z)}
        onPick={onPickTarget ? () => onPickTarget("start") : undefined}
        picking={pickTarget === "start"}
      />
      <EndpointFields
        label="Ponto B — final"
        point={geometry.end}
        mode={mode}
        inputMode={coordInputMode}
        utmFuso={utmFuso}
        wgsLat={wgs.end.lat}
        wgsLng={wgs.end.lng}
        onChangeWgs={(lat, lng, z) => applyWgs("end", lat, lng, z)}
        onPick={onPickTarget ? () => onPickTarget("end") : undefined}
        picking={pickTarget === "end"}
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-[var(--muted)]">
          Colar A
          <input
            type="text"
            placeholder={
              coordInputMode === "utm"
                ? "7390000, 500000, 12"
                : "-26.28, -48.67, 12"
            }
            className="mt-0.5 w-full rounded border px-1 py-0.5 text-xs"
            onBlur={(e) => pasteEndpoint("start", e.target.value)}
          />
        </label>
        <label className="text-[10px] text-[var(--muted)]">
          Colar B
          <input
            type="text"
            placeholder={
              coordInputMode === "utm"
                ? "7390100, 500200, 11"
                : "-26.28, -48.66, 11"
            }
            className="mt-0.5 w-full rounded border px-1 py-0.5 text-xs"
            onBlur={(e) => pasteEndpoint("end", e.target.value)}
          />
        </label>
      </div>

      {coordInputMode === "utm" && (
        <p className="text-[9px] text-[var(--muted)]">
          UTM: ordem N, E, Z (metros). Fuso {utmFuso} (ex. 22S Santa Catarina).
        </p>
      )}

      {geometry.azimuthDeg != null && (
        <p className="text-[10px] text-[var(--muted)]">
          Azimute: {geometry.azimuthDeg.toFixed(1)}° · Comprimento planimétrico
          estimado a partir de A→B
        </p>
      )}
    </div>
  );
}
