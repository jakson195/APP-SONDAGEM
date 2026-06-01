"use client";

import {
  applyLogBoundsScale,
  paletteColor,
  rhoToNormalized,
  type ResistivityColorScale,
} from "@/lib/geofisica/dipolo2d/colormap";

type Props = {
  logLo: number;
  logHi: number;
  colorScale?: ResistivityColorScale;
  className?: string;
};

export function VolumeLegend({
  logLo,
  logHi,
  colorScale = { auto: true, rhoMinOhmM: null, rhoMaxOhmM: null, palette: "x2ipi" },
  className = "",
}: Props) {
  const { logLo: lo, logHi: hi } = applyLogBoundsScale(logLo, logHi, colorScale);
  const steps = 24;
  const rhoMin = 10 ** lo;
  const rhoMax = 10 ** hi;

  return (
    <div
      className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 ${className}`}
    >
      <p className="mb-2 text-xs font-medium text-[var(--text)]">
        Resistividade (Ω·m)
      </p>
      <div
        className="h-3 w-full rounded"
        style={{
          background: `linear-gradient(to right, ${Array.from({ length: steps }, (_, i) => {
            const t = i / (steps - 1);
            const [r, g, b] = paletteColor(colorScale.palette, t);
            return `rgb(${r},${g},${b})`;
          }).join(",")})`,
        }}
      />
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
        <span>{rhoMin < 100 ? rhoMin.toFixed(0) : rhoMin.toExponential(1)}</span>
        <span>{rhoMax < 100 ? rhoMax.toFixed(0) : rhoMax.toExponential(1)}</span>
      </div>
      <p className="mt-2 text-[10px] text-[var(--muted)]">
        log₁₀(ρ): {lo.toFixed(2)} → {hi.toFixed(2)}
      </p>
    </div>
  );
}

export function volumeStatsToLegendBounds(stats: {
  min: number;
  max: number;
}): { logLo: number; logHi: number } {
  return { logLo: stats.min, logHi: stats.max };
}

export function logRhoToColorHex(
  logRho: number,
  logLo: number,
  logHi: number,
  palette: ResistivityColorScale["palette"] = "x2ipi",
): string {
  const rho = 10 ** logRho;
  const t = rhoToNormalized(rho, logLo, logHi);
  const [r, g, b] = paletteColor(palette, t);
  return `rgb(${r},${g},${b})`;
}
