"use client";

import { useEffect, useRef } from "react";
import type { LineQcMetrics } from "@/lib/geofisica/qc/qc-types";
import { QC_GRADE_COLORS } from "@/lib/geofisica/qc/qc-types";

type Props = {
  line: LineQcMetrics;
  height?: number;
};

export function QcNoiseChart({ line, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || line.stationsM.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = { l: 36, r: 8, t: 8, b: 24 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;

    const xs = line.stationsM;
    const x0 = xs[0]!;
    const x1 = xs[xs.length - 1]!;

    const allY = [
      ...line.residualLogRho,
      ...line.filteredLogRho.map((_, i) => line.residualLogRho[i] ?? 0),
    ];
    let yMin = Math.min(...allY, 0);
    let yMax = Math.max(...allY, 0.01);
    const yPad = (yMax - yMin) * 0.1 || 0.1;
    yMin -= yPad;
    yMax += yPad;

    const toX = (x: number) =>
      pad.l + ((x - x0) / Math.max(x1 - x0, 1e-6)) * pw;
    const toY = (y: number) =>
      pad.t + ph - ((y - yMin) / (yMax - yMin)) * ph;

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t + ph);
    ctx.lineTo(pad.l + pw, pad.t + ph);
    ctx.stroke();

    ctx.strokeStyle = "#64748b";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.l, toY(0));
    ctx.lineTo(pad.l + pw, toY(0));
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#0d9488";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    line.filteredLogRho.forEach((v, i) => {
      const x = toX(xs[i] ?? i);
      const y = toY(v - (line.residualLogRho[i] ?? 0));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    line.readingPoints.forEach((pt, i) => {
      const x = toX(pt.stationM);
      const y = toY(line.residualLogRho[i] ?? 0);
      ctx.fillStyle = QC_GRADE_COLORS[pt.grade].hex;
      ctx.beginPath();
      ctx.arc(x, y, pt.isSpike ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px sans-serif";
    ctx.fillText("Resíduo log₁₀(ρ)", pad.l, pad.t + 10);
    ctx.fillText("0", 4, toY(0) + 3);
  }, [line, height]);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-slate-950 p-2">
      <p className="mb-1 text-[10px] text-slate-400">
        Ruído / resíduo — {line.lineName} (SNR {line.snr.toFixed(1)})
      </p>
      <canvas ref={canvasRef} className="w-full" style={{ height }} />
    </div>
  );
}
