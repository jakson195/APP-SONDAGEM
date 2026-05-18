"use client";

import { useMemo } from "react";
import { SptProfileChart } from "@/components/spt-profile-chart";
import { buildSoilProfile } from "@/lib/soil-profile";
import {
  CPRM_SOIL_FILL,
  CPRM_SOIL_STROKE,
  cprmSoilInk,
} from "@/lib/cprm-soil-palette";
import { classifySoilMaterial } from "@/lib/soil-type";
import type { SptReading } from "@/lib/types";

const BLACK = "#000000";

/** Outer SVG / chart height — inner depth scale uses marginTop + marginBottom. */
export const CPRM_ALIGN_FIGURE = {
  height: 360,
  marginTop: 14,
  marginBottom: 28,
} as const;

function depthTicks(maxM: number): number[] {
  if (maxM <= 0.05) return [0];
  const step = maxM <= 3 ? 0.5 : maxM <= 12 ? 1 : maxM <= 25 ? 2 : 5;
  const ticks: number[] = [];
  for (let d = 0; d <= maxM + 1e-9; d += step) {
    ticks.push(Math.round(d * 100) / 100);
  }
  const last = ticks[ticks.length - 1];
  if (last !== undefined && last < maxM - 1e-6) {
    ticks.push(Math.round(maxM * 100) / 100);
  }
  return ticks;
}

type Props = {
  readings: SptReading[];
  maxDepthM: number;
  /** Column width of the colored profile strip (px in viewBox) */
  profileColW?: number;
  className?: string;
};

/**
 * Single row: depth scale (m) | stratigraphic color column | NSPT vs depth.
 * Shared vertical geometry so depth aligns across all three.
 */
export function CprmAlignedFigure({
  readings,
  maxDepthM,
  profileColW = 56,
  className = "",
}: Props) {
  const depthMax = Math.max(maxDepthM, 0.1);
  const H = CPRM_ALIGN_FIGURE.height;
  const plotTop = CPRM_ALIGN_FIGURE.marginTop;
  const plotBottom = CPRM_ALIGN_FIGURE.marginBottom;
  const plotH = H - plotTop - plotBottom;
  const rulerW = 44;
  const viewW = rulerW + profileColW;

  const layers = useMemo(
    () => buildSoilProfile(readings, depthMax),
    [readings, depthMax],
  );

  const ticks = useMemo(() => depthTicks(depthMax), [depthMax]);

  const depthY = (d: number) => plotTop + (d / depthMax) * plotH;

  const chartMargin = useMemo(
    () => ({
      top: CPRM_ALIGN_FIGURE.marginTop,
      right: 14,
      bottom: CPRM_ALIGN_FIGURE.marginBottom,
      left: 26,
    }),
    [],
  );

  if (readings.filter((r) => r.depthM > 0).length === 0) {
    return (
      <div
        className={`border border-black bg-white px-4 py-8 text-center text-xs text-black ${className}`}
      >
        <p className="font-medium">Gráfico NSPT e perfil</p>
        <p className="mt-1">Informe profundidades &gt; 0 com leituras SPT.</p>
      </div>
    );
  }

  return (
    <div
      className={`flex w-full flex-row border border-black bg-white text-black print:border-black ${className}`}
    >
      <svg
        width={rulerW + profileColW}
        height={H}
        className="shrink-0 border-r border-black"
        viewBox={`0 0 ${viewW} ${H}`}
        aria-label="Escala de profundidade e coluna de perfil"
      >
        <line
          x1={rulerW - 1}
          y1={plotTop}
          x2={rulerW - 1}
          y2={plotTop + plotH}
          stroke={BLACK}
          strokeWidth={0.75}
        />
        {ticks.map((d) => {
          const y = depthY(d);
          return (
            <g key={d}>
              <line
                x1={rulerW - 6}
                y1={y}
                x2={rulerW - 1}
                y2={y}
                stroke={BLACK}
                strokeWidth={0.5}
              />
              <text
                x={rulerW - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fill={BLACK}
                style={{ fontSize: 9 }}
              >
                {d.toFixed(depthMax < 5 ? 2 : 1)}
              </text>
              <line
                x1={rulerW}
                y1={y}
                x2={viewW}
                y2={y}
                stroke={BLACK}
                strokeWidth={0.25}
                strokeOpacity={0.35}
                strokeDasharray="3 3"
              />
            </g>
          );
        })}
        <text
          x={12}
          y={plotTop + plotH / 2}
          transform={`rotate(-90 12 ${plotTop + plotH / 2})`}
          textAnchor="middle"
          fill={BLACK}
          style={{ fontSize: 10 }}
        >
          Profundidade (m)
        </text>

        <rect
          x={rulerW}
          y={plotTop}
          width={profileColW}
          height={plotH}
          fill="#ffffff"
          stroke={BLACK}
          strokeWidth={0.75}
        />
        <text
          x={rulerW + profileColW / 2}
          y={plotTop - 3}
          textAnchor="middle"
          fill={BLACK}
          style={{ fontSize: 8 }}
        >
          LN
        </text>

        {layers.map((layer, i) => {
          const y1 = depthY(layer.fromM);
          const y2 = depthY(layer.toM);
          const h = Math.max(y2 - y1, 0.5);
          const kind = classifySoilMaterial(layer.description);
          const ink = cprmSoilInk(kind);
          return (
            <g key={`${layer.fromM}-${layer.toM}-${i}`}>
              <rect
                x={rulerW}
                y={y1}
                width={profileColW}
                height={h}
                fill={CPRM_SOIL_FILL[kind]}
                stroke={CPRM_SOIL_STROKE[kind]}
                strokeWidth={0.5}
              />
              {h >= 20 && (
                <text
                  x={rulerW + profileColW / 2}
                  y={y1 + h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={ink}
                  style={{ fontSize: 8, fontWeight: 600 }}
                >
                  {layer.nspt !== undefined ? `${layer.nspt}` : "—"}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="min-h-0 min-w-0 flex-1 border-black bg-white">
        <SptProfileChart
          readings={readings}
          maxDepthM={depthMax}
          compact={false}
          title="NSPT"
          embedded
          showSoilDescriptionColumn={false}
          plotHeight={H}
          chartMargin={chartMargin}
          yAxisLabel="Profundidade (m)"
          xAxisLabel="NSPT"
          className="border-0 shadow-none"
        />
      </div>
    </div>
  );
}
