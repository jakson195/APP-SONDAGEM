"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildSoilProfile } from "@/lib/soil-profile";
import {
  classifySoilMaterial,
  SOIL_MATERIAL_FILL,
  SOIL_MATERIAL_LABEL,
  SOIL_MATERIAL_ORDER,
  SOIL_MATERIAL_STROKE,
  soilMaterialInk,
} from "@/lib/soil-type";
import { computeNspt } from "@/lib/spt";
import type { SptReading } from "@/lib/types";

export type SptChartPoint = { depth: number; nspt: number };

export function buildSptChartPoints(readings: SptReading[]): SptChartPoint[] {
  return readings
    .filter((r) => r.depthM > 0)
    .map((r) => ({
      depth: r.depthM,
      nspt: computeNspt(r.n2, r.n3),
    }))
    .sort((a, b) => a.depth - b.depth);
}

type Props = {
  readings: SptReading[];
  maxDepthM?: number;
  title?: string;
  compact?: boolean;
  className?: string;
  /** Minimal chrome for embedding beside a separate profile column (e.g. CPRM figure). */
  embedded?: boolean;
  /** When false, only the NSPT plot is shown (soil strip hidden — profile lives elsewhere). */
  showSoilDescriptionColumn?: boolean;
  /** Pixel height of the plot area (matches aligned depth scale when set). */
  plotHeight?: number;
  chartMargin?: { top: number; right: number; bottom: number; left: number };
  yAxisLabel?: string;
  xAxisLabel?: string;
};

/** Thin black engineering plot */
const BLACK = "#000000";
const PLOT_WHITE = "#ffffff";

function inclusiveRange(
  start: number,
  end: number,
  step: number,
): number[] {
  if (step <= 0) return [start, end];
  const out: number[] = [];
  let x = start;
  let guard = 0;
  while (x <= end + 1e-9 && guard < 8000) {
    out.push(Number(x.toPrecision(12)));
    x += step;
    guard++;
  }
  const last = out[out.length - 1];
  if (last !== undefined && last < end - 1e-9) {
    out.push(Number(end.toPrecision(12)));
  }
  return out;
}

export function SptProfileChart({
  readings,
  maxDepthM = 0,
  title = "SPT profile",
  compact = false,
  className = "",
  embedded = false,
  showSoilDescriptionColumn = true,
  plotHeight: plotHeightProp,
  chartMargin,
  yAxisLabel,
  xAxisLabel,
}: Props) {
  const data = useMemo(() => buildSptChartPoints(readings), [readings]);

  const depthMax = useMemo(() => {
    const fromPoints = data.length > 0 ? Math.max(...data.map((d) => d.depth)) : 0;
    return Math.max(fromPoints, maxDepthM, 0.1);
  }, [data, maxDepthM]);

  const nsptMax = useMemo(() => {
    const m = data.length > 0 ? Math.max(...data.map((d) => d.nspt), 5) : 10;
    return Math.ceil(m / 5) * 5;
  }, [data]);

  /** Horizontal grid: every 1 m depth */
  const depthGridM = useMemo(
    () => inclusiveRange(0, depthMax, 1),
    [depthMax],
  );

  /** Vertical grid: every 5 NSPT */
  const nsptGrid5 = useMemo(
    () => inclusiveRange(0, nsptMax, 5),
    [nsptMax],
  );

  const soilLayers = useMemo(
    () => buildSoilProfile(readings, depthMax),
    [readings, depthMax],
  );

  const plotHeight =
    plotHeightProp ?? (compact ? 260 : 340);

  const margin =
    chartMargin ??
    (compact
      ? { top: 10, right: 12, left: 14, bottom: 28 }
      : { top: 14, right: 18, left: 22, bottom: 36 });

  const xLab = xAxisLabel ?? "NSPT";
  const yLab = yAxisLabel ?? "Depth (m)";

  if (data.length === 0) {
    return (
      <div
        className={
          embedded
            ? `flex min-h-[120px] items-center justify-center border border-dashed border-black bg-white px-3 text-center text-xs text-black ${className}`
            : `rounded-lg border border-dashed border-neutral-400 bg-white px-4 py-8 text-center text-sm text-neutral-600 ${className}`
        }
      >
        <div>
          <p className="font-medium text-neutral-900">{title}</p>
          {!embedded && (
            <p className="mt-1">
              Add SPT intervals with depth &gt; 0 to plot NSPT against depth.
            </p>
          )}
        </div>
      </div>
    );
  }

  const plotBlock = (
    <div
      className={`mx-auto flex w-full ${embedded ? "" : "max-w-[min(100%,560px)]"} flex-row items-stretch gap-0`}
    >
      <div className="min-h-0 min-w-0 flex-1" style={{ height: plotHeight }}>
        <ResponsiveContainer width="100%" height={plotHeight} debounce={50}>
          <LineChart data={data} margin={margin}>
              <CartesianGrid
                horizontalValues={depthGridM}
                verticalValues={nsptGrid5}
                stroke={BLACK}
                strokeWidth={0.5}
                horizontal
                vertical
              />

              <XAxis
                type="number"
                dataKey="nspt"
                domain={[0, nsptMax]}
                tick={{ fill: BLACK, fontSize: compact ? 9 : 10, fontFamily: "system-ui" }}
                tickLine={{ stroke: BLACK, strokeWidth: 0.75 }}
                axisLine={{ stroke: BLACK, strokeWidth: 0.75 }}
                label={{
                  value: xLab,
                  position: "bottom",
                  offset: compact ? 10 : 14,
                  fill: BLACK,
                  fontSize: compact ? 11 : 12,
                  fontWeight: 600,
                  fontFamily: "system-ui",
                }}
              />
              <YAxis
                type="number"
                dataKey="depth"
                domain={[0, depthMax]}
                reversed
                tick={{ fill: BLACK, fontSize: compact ? 9 : 10, fontFamily: "system-ui" }}
                tickLine={{ stroke: BLACK, strokeWidth: 0.75 }}
                axisLine={{ stroke: BLACK, strokeWidth: 0.75 }}
                label={{
                  value: yLab,
                  angle: -90,
                  position: "insideLeft",
                  offset: compact ? 4 : 8,
                  fill: BLACK,
                  fontSize: compact ? 11 : 12,
                  fontWeight: 600,
                  fontFamily: "system-ui",
                }}
              />

              <Tooltip
                cursor={{
                  stroke: BLACK,
                  strokeWidth: 0.75,
                  strokeDasharray: "3 3",
                }}
                contentStyle={{
                  borderRadius: 2,
                  border: `1px solid ${BLACK}`,
                  fontSize: 11,
                  fontFamily: "system-ui",
                  background: PLOT_WHITE,
                  color: BLACK,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                }}
                formatter={(value, name) => {
                  const n = typeof value === "number" ? value : Number(value);
                  if (name === "depth" && Number.isFinite(n)) {
                    return [`${n.toFixed(2)} m`, "Depth"];
                  }
                  if (name === "nspt" && Number.isFinite(n)) {
                    return [n, "NSPT"];
                  }
                  return [value, String(name)];
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as SptChartPoint | undefined;
                  if (p) {
                    return `Depth ${p.depth.toFixed(2)} m · NSPT ${p.nspt}`;
                  }
                  return "";
                }}
              />

              <Line
                type="linear"
                dataKey="depth"
                stroke={BLACK}
                strokeWidth={1}
                dot={{
                  r: compact ? 4 : 4.5,
                  fill: PLOT_WHITE,
                  stroke: BLACK,
                  strokeWidth: 1.25,
                }}
                activeDot={{
                  r: compact ? 5.5 : 6,
                  fill: PLOT_WHITE,
                  stroke: BLACK,
                  strokeWidth: 1.5,
                }}
                connectNulls
                isAnimationActive={false}
                name="depth"
              />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {showSoilDescriptionColumn && (
        <aside
          className="flex w-[7.25rem] shrink-0 flex-col border-l border-black bg-white sm:w-36"
          style={{ height: plotHeight }}
          aria-label="Soil description by depth interval"
        >
          {soilLayers.length === 0 ? (
            <div className="flex flex-1 items-center px-1.5 py-2 text-[9px] leading-snug text-neutral-500">
              No intervals with depth &gt; 0.
            </div>
          ) : (
            soilLayers.map((layer, i) => {
              const thick = Math.max(layer.toM - layer.fromM, 0);
              const kind = classifySoilMaterial(layer.description);
              return (
                <div
                  key={`${layer.fromM}-${layer.toM}-${i}`}
                  className="flex items-center overflow-hidden border-b border-neutral-400/90 px-1.5 py-0.5 text-[9px] leading-tight sm:text-[10px]"
                  style={{
                    flex: Math.max(thick, 1e-6),
                    minHeight: compact ? 16 : 18,
                    backgroundColor: SOIL_MATERIAL_FILL[kind],
                    borderLeftWidth: 4,
                    borderLeftColor: SOIL_MATERIAL_STROKE[kind],
                    borderLeftStyle: "solid",
                    color: soilMaterialInk(kind),
                  }}
                  title={`${layer.fromM.toFixed(2)}–${layer.toM.toFixed(2)} m · ${SOIL_MATERIAL_LABEL[kind]} · ${layer.description}`}
                >
                  <span className="line-clamp-[10] break-words font-medium">
                    {layer.description}
                  </span>
                </div>
              );
            })
          )}
        </aside>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div
        className={`bg-white text-black ${className}`}
        aria-label={title}
      >
        {plotBlock}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border-2 border-neutral-800 bg-white text-neutral-900 shadow-md ${className}`}
    >
      <div className="border-b-2 border-neutral-700 bg-neutral-50 px-3 py-2 sm:px-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-800 sm:text-sm">
          {title}
        </h3>
        <p className="mt-0.5 text-[10px] leading-snug text-neutral-600 sm:text-xs">
          Grid 1 m × 5 NSPT · profundidade para baixo · legenda de materiais conforme descrição
          de campo (classificação automática).
        </p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-neutral-300 pt-2">
          {SOIL_MATERIAL_ORDER.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 text-[8px] text-neutral-800 sm:text-[9px]"
            >
              <span
                className="h-2.5 w-5 shrink-0 rounded-sm border shadow-sm"
                style={{
                  backgroundColor: SOIL_MATERIAL_FILL[k],
                  borderColor: SOIL_MATERIAL_STROKE[k],
                }}
                aria-hidden
              />
              <span className="font-medium">{SOIL_MATERIAL_LABEL[k]}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="border-b border-neutral-300 bg-white p-2 sm:p-3">
        {plotBlock}
      </div>
    </div>
  );
}
