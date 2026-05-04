"use client";

import {
  GoogleMap,
  GroundOverlayF,
  MarkerF,
  PolylineF,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useEffect, useMemo, useState } from "react";
import { GOOGLE_MAPS_JS_LOADER_ID } from "@/lib/google-maps-js-loader-id";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/google-maps-libraries";
import {
  boundsFromPoints,
  buildHeatmapDataUrl,
  buildIdwGrid,
  gradientAt,
  latLngToLocalM,
  localMToLatLng,
  marchingSquaresSegments,
  mergeGridSegmentsToPaths,
  type ScalarPoint,
} from "@/lib/hydraulic-interpolation";

export type PiezoWellHead = {
  id: number;
  codigo: string;
  lat: number;
  lng: number;
  headM: number;
  depthM: number;
  fonte: "leitura" | "nivelAgua";
};

const MAP_HEIGHT = 520;

type Props = {
  wells: PiezoWellHead[];
};

function contourLevels(zMin: number, zMax: number, count: number): number[] {
  if (zMax <= zMin) return [zMin];
  const out: number[] = [];
  for (let k = 1; k <= count; k += 1) {
    out.push(zMin + ((zMax - zMin) * k) / (count + 1));
  }
  return out;
}

function boundsLiteralFromBoundsM(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  lat0: number,
  lng0: number,
): google.maps.LatLngBoundsLiteral {
  const c = [
    localMToLatLng(lat0, lng0, { x: bounds.minX, y: bounds.minY }),
    localMToLatLng(lat0, lng0, { x: bounds.maxX, y: bounds.minY }),
    localMToLatLng(lat0, lng0, { x: bounds.maxX, y: bounds.maxY }),
    localMToLatLng(lat0, lng0, { x: bounds.minX, y: bounds.maxY }),
  ];
  const lats = c.map((p) => p.lat);
  const lngs = c.map((p) => p.lng);
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  };
}

export function PiezoHydraulicHeadMap({ wells }: Props) {
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_JS_LOADER_ID,
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
    libraries: [...GOOGLE_MAPS_LIBRARIES],
  });

  const center = useMemo(() => {
    if (wells.length === 0) return { lat: -14.235004, lng: -51.92528 };
    const s = wells.reduce(
      (a, w) => ({ lat: a.lat + w.lat, lng: a.lng + w.lng }),
      { lat: 0, lng: 0 },
    );
    return { lat: s.lat / wells.length, lng: s.lng / wells.length };
  }, [wells]);

  const model = useMemo(() => {
    if (wells.length < 2) return null;

    const lat0 = center.lat;
    const lng0 = center.lng;

    const xyPts = wells.map((w) => latLngToLocalM(lat0, lng0, w.lat, w.lng));
    const bounds = boundsFromPoints(xyPts, 120);
    if (!bounds) return null;

    const scalar: ScalarPoint[] = wells.map((w, i) => ({
      ...xyPts[i],
      z: w.headM,
    }));

    const nx = 40;
    const ny = 40;
    const { grid } = buildIdwGrid(bounds, nx, ny, scalar, 2);

    let zMin = Math.min(...wells.map((w) => w.headM));
    let zMax = Math.max(...wells.map((w) => w.headM));
    const padZ = Math.max(0.5, (zMax - zMin) * 0.08);
    zMin -= padZ;
    zMax += padZ;

    const levels = contourLevels(zMin, zMax, 7);
    const contourPaths: google.maps.LatLngLiteral[][] = [];
    for (const L of levels) {
      const segs = marchingSquaresSegments(grid, nx, ny, L);
      const paths = mergeGridSegmentsToPaths(segs, bounds, nx, ny, lat0, lng0);
      for (const p of paths) {
        if (p.length >= 2) contourPaths.push(p);
      }
    }

    const arrowPaths: google.maps.LatLngLiteral[][] = [];
    const step = 4;
    const arrowLenM = 45;
    for (let j = step; j < ny - step; j += step) {
      for (let i = step; i < nx - step; i += step) {
        const g = gradientAt(grid, nx, ny, i, j, bounds);
        const gx = -g.x;
        const gy = -g.y;
        const len = Math.hypot(gx, gy);
        if (len < 1e-6) continue;
        const ux = (gx / len) * arrowLenM;
        const uy = (gy / len) * arrowLenM;

        const dx = (bounds.maxX - bounds.minX) / Math.max(1, nx - 1);
        const dy = (bounds.maxY - bounds.minY) / Math.max(1, ny - 1);
        const mx = bounds.minX + i * dx;
        const my = bounds.minY + j * dy;
        const p0 = localMToLatLng(lat0, lng0, { x: mx - ux * 0.35, y: my - uy * 0.35 });
        const p1 = localMToLatLng(lat0, lng0, { x: mx + ux * 0.65, y: my + uy * 0.65 });
        const wing = 0.35;
        const wx = -uy * wing;
        const wy = ux * wing;
        const p2 = localMToLatLng(lat0, lng0, { x: mx + ux * 0.35 + wx, y: my + uy * 0.35 + wy });
        arrowPaths.push([
          { lat: p0.lat, lng: p0.lng },
          { lat: p1.lat, lng: p1.lng },
        ]);
        arrowPaths.push([
          { lat: p1.lat, lng: p1.lng },
          { lat: p2.lat, lng: p2.lng },
        ]);
      }
    }

    const overlayBounds = boundsLiteralFromBoundsM(bounds, lat0, lng0);

    return {
      lat0,
      lng0,
      bounds,
      nx,
      ny,
      grid,
      zMin,
      zMax,
      levels,
      contourPaths,
      arrowPaths,
      overlayBounds,
    };
  }, [wells, center.lat, center.lng]);

  useEffect(() => {
    if (!model) {
      setHeatmapUrl(null);
      return;
    }
    const url = buildHeatmapDataUrl(
      model.grid,
      model.nx,
      model.ny,
      model.zMin,
      model.zMax,
    );
    setHeatmapUrl(url || null);
  }, [model]);

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
        Erro ao carregar Google Maps.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        A carregar mapa…
      </div>
    );
  }

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
        Defina <code className="font-mono text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> em{" "}
        <code className="font-mono text-xs">.env.local</code>.
      </div>
    );
  }

  if (wells.length < 2) {
    return (
      <p className="text-sm text-[var(--muted)]">
        São necessários pelo menos 2 poços com posição (GPS ou mapa) e carga hidráulica
        (cota boca − nível) para gerar o mapa.
      </p>
    );
  }

  if (!model) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Não foi possível calcular o domínio do mapa.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-[var(--border)] shadow-sm">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: MAP_HEIGHT }}
          center={center}
          zoom={15}
          options={{
            streetViewControl: false,
            mapTypeId: "hybrid",
            fullscreenControl: true,
          }}
        >
          {heatmapUrl ? (
            <GroundOverlayF
              key={heatmapUrl}
              url={heatmapUrl}
              bounds={model.overlayBounds}
              options={{ opacity: 0.55 }}
            />
          ) : null}

          {model.contourPaths.map((path, idx) => (
            <PolylineF
              key={`iso-${idx}`}
              path={path}
              options={{
                strokeColor: "#b71c1c",
                strokeOpacity: 0.95,
                strokeWeight: 2,
                clickable: false,
              }}
            />
          ))}

          {model.arrowPaths.map((path, idx) => (
            <PolylineF
              key={`fl-${idx}`}
              path={path}
              options={{
                strokeColor: "#111827",
                strokeOpacity: 0.85,
                strokeWeight: 2,
                clickable: false,
              }}
            />
          ))}

          {wells.map((w) => (
            <MarkerF
              key={w.id}
              position={{ lat: w.lat, lng: w.lng }}
              title={`${w.codigo} — carga ${w.headM.toFixed(2)} m (${w.fonte})`}
            />
          ))}
        </GoogleMap>
      </div>

      <div className="flex flex-wrap items-start gap-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-xs text-[var(--muted)]">
        <div>
          <p className="font-semibold text-[var(--text)]">Legenda — carga hidráulica (m)</p>
          <p className="mt-1">
            Interpolação IDW sobre{" "}
            <strong className="text-[var(--text)]">{wells.length}</strong> poços. Carga = cota
            boca − profundidade do nível (última leitura ou Nₐ do boletim).
          </p>
          <div
            className="mt-2 h-4 w-56 max-w-full rounded border border-[var(--border)]"
            style={{
              background:
                "linear-gradient(90deg, rgb(15,60,140) 0%, rgb(120,200,230) 50%, rgb(245,245,255) 100%)",
            }}
          />
          <p className="mt-1 font-mono">
            {model.zMin.toFixed(1)} m ← → {model.zMax.toFixed(1)} m
          </p>
        </div>
        <div>
          <p className="font-semibold text-[var(--text)]">Símbolos</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>Cor (semi-transparente): campo interpolado</li>
            <li>Vermelho: isolinhas</li>
            <li>Preto: direção de escoamento (aprox. −∇h)</li>
            <li>Marcadores: poços</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
