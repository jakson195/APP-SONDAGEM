"use client";

import { useMemo } from "react";
import { buildSoilProfile, profileDiagramSpanM } from "@/lib/soil-profile";
import {
  classifySoilMaterial,
  SOIL_MATERIAL_FILL,
  SOIL_MATERIAL_LABEL,
  SOIL_MATERIAL_ORDER,
  SOIL_MATERIAL_STROKE,
  soilMaterialInk,
} from "@/lib/soil-type";
import type { SptReading } from "@/lib/types";

type Props = {
  readings: SptReading[];
  boreholeDepthM: number;
  compact?: boolean;
  title?: string;
  className?: string;
};

function depthTicks(maxM: number): number[] {
  if (maxM <= 0.05) return [0];
  const step =
    maxM <= 3 ? 0.5 : maxM <= 12 ? 1 : maxM <= 25 ? 2 : 5;
  const ticks: number[] = [];
  for (let d = 0; d <= maxM + 1e-9; d += step) {
    ticks.push(Math.round(d * 100) / 100);
  }
  const last = ticks[ticks.length - 1];
  if (last < maxM - 1e-6) {
    ticks.push(Math.round(maxM * 100) / 100);
  }
  return ticks;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function VerticalSoilProfile({
  readings,
  boreholeDepthM,
  compact = false,
  title = "Soil profile (from SPT)",
  className = "",
}: Props) {
  const layers = useMemo(
    () => buildSoilProfile(readings, boreholeDepthM),
    [readings, boreholeDepthM],
  );
  const maxDepth = useMemo(
    () => profileDiagramSpanM(layers, boreholeDepthM),
    [layers, boreholeDepthM],
  );

  const VIEW_W = compact ? 420 : 560;
  const VIEW_H = compact ? 260 : 400;
  const M = { l: compact ? 44 : 52, r: compact ? 12 : 14, t: compact ? 14 : 18, b: compact ? 22 : 26 };
  const profileW = compact ? 72 : 92;
  const descX = M.l + profileW + (compact ? 8 : 12);
  const plotTop = M.t;
  const plotH = VIEW_H - M.t - M.b;
  const profileX = M.l;

  const depthY = (d: number) => plotTop + (d / maxDepth) * plotH;

  const ticks = useMemo(() => depthTicks(maxDepth), [maxDepth]);

  if (layers.length === 0) {
    return (
      <div
        className={`rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--muted)] ${className}`}
      >
        <p className="font-medium text-[var(--text)]">{title}</p>
        <p className="mt-1">
          Add SPT rows with depth greater than 0 to draw the vertical profile.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border-2 border-neutral-700 bg-[var(--card)] shadow-sm ${className}`}
    >
      <div className="border-b-2 border-neutral-700 bg-neutral-50 px-4 py-3 dark:bg-neutral-900/40">
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
          Profundidade para baixo · cores por material (descrição de campo) · NSPT na
          amostra · trecho total {maxDepth.toFixed(maxDepth < 10 ? 2 : 1)} m
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-neutral-300 pt-2 dark:border-neutral-600">
          {SOIL_MATERIAL_ORDER.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-neutral-800 dark:text-neutral-200"
            >
              <span
                className="h-2.5 w-5 shrink-0 rounded-sm border shadow-sm"
                style={{
                  backgroundColor: SOIL_MATERIAL_FILL[k],
                  borderColor: SOIL_MATERIAL_STROKE[k],
                }}
                aria-hidden
              />
              {SOIL_MATERIAL_LABEL[k]}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto p-4">
        <svg
          width="100%"
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="max-w-full text-slate-700 dark:text-slate-200"
          role="img"
          aria-label="Vertical soil profile from SPT data"
        >
          {/* Depth axis */}
          <line
            x1={profileX - 2}
            y1={plotTop}
            x2={profileX - 2}
            y2={plotTop + plotH}
            className="stroke-slate-400 dark:stroke-slate-500"
            strokeWidth={1.5}
          />
          {ticks.map((d) => {
            const y = depthY(d);
            return (
              <g key={d}>
                <line
                  x1={profileX - 8}
                  y1={y}
                  x2={profileX - 2}
                  y2={y}
                  className="stroke-slate-400 dark:stroke-slate-500"
                  strokeWidth={1}
                />
                <text
                  x={profileX - 12}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-[var(--muted)] text-[9px] sm:text-[10px]"
                  style={{ fontSize: compact ? 9 : 10 }}
                >
                  {d.toFixed(maxDepth < 5 ? 2 : 1)}
                </text>
                <line
                  x1={profileX}
                  y1={y}
                  x2={VIEW_W - M.r}
                  y2={y}
                  className="stroke-slate-200/90 dark:stroke-slate-700/70"
                  strokeWidth={0.5}
                  strokeDasharray="4 4"
                />
              </g>
            );
          })}
          <text
            x={profileX - 28}
            y={plotTop + plotH / 2}
            transform={`rotate(-90 ${profileX - 28} ${plotTop + plotH / 2})`}
            textAnchor="middle"
            className="fill-[var(--muted)] text-[10px]"
            style={{ fontSize: 10 }}
          >
            Depth (m)
          </text>

          {/* Soil column */}
          {layers.map((layer, i) => {
            const y1 = depthY(layer.fromM);
            const y2 = depthY(layer.toM);
            const h = Math.max(y2 - y1, 1);
            const midY = (y1 + y2) / 2;
            const kind = classifySoilMaterial(layer.description);
            return (
              <g key={`${layer.fromM}-${layer.toM}-${i}`}>
                <rect
                  x={profileX}
                  y={y1}
                  width={profileW}
                  height={h}
                  fill={SOIL_MATERIAL_FILL[kind]}
                  stroke={SOIL_MATERIAL_STROKE[kind]}
                  strokeWidth={1.25}
                  rx={1}
                />
                {h >= (compact ? 22 : 26) && (
                  <text
                    x={profileX + profileW / 2}
                    y={midY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none"
                    fill={soilMaterialInk(kind)}
                    style={{
                      fontSize: compact ? 8 : 9,
                      fontWeight: 600,
                    }}
                  >
                    {layer.nspt !== undefined ? `N=${layer.nspt}` : "—"}
                  </text>
                )}
                <text
                  x={descX}
                  y={midY}
                  dominantBaseline="middle"
                  className="fill-[var(--text)] text-[9px] dark:fill-slate-100"
                  style={{ fontSize: compact ? 9 : 10 }}
                >
                  {truncate(layer.description, compact ? 36 : 52)}
                </text>
              </g>
            );
          })}

          {/* Column outline */}
          <rect
            x={profileX}
            y={plotTop}
            width={profileW}
            height={plotH}
            fill="none"
            className="stroke-slate-500 dark:stroke-slate-400"
            strokeWidth={1.5}
            rx={2}
          />

          {/* Surface marker */}
          <text
            x={profileX + profileW / 2}
            y={plotTop - 4}
            textAnchor="middle"
            className="fill-[var(--muted)] text-[9px]"
            style={{ fontSize: 9 }}
          >
            GL
          </text>
        </svg>
      </div>
    </div>
  );
}

/** Max depth from readings with depth &gt; 0 (for live preview). */
export function maxSampleDepthFromReadings(readings: SptReading[]): number {
  const depths = readings.filter((r) => r.depthM > 0).map((r) => r.depthM);
  if (depths.length === 0) return 0;
  return Math.max(...depths);
}
