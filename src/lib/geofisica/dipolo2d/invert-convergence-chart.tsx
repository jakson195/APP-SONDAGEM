"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Dipolo2DIterationRecord } from "./types";

type Props = {
  history: Dipolo2DIterationRecord[];
  className?: string;
};

export function InvertConvergenceChart({ history, className }: Props) {
  if (history.length < 2) return null;

  const data = history.map((row) => ({
    iter: row.iter + 1,
    rmsLog10: row.rmsLog10,
    rmsPercent: row.rmsPercent ?? null,
    lambda: row.lambda,
    phi: row.phi,
  }));

  return (
    <div className={className}>
      <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">
        Convergência RMS (estilo RES2DINV)
      </h3>
      <p className="mb-2 text-xs text-[var(--muted)]">
        Erro RMS em log₁₀(ρ) e RMS relativo (%) por iteração Gauss-Newton; λ adaptativo
        quando activo.
      </p>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
            <XAxis
              dataKey="iter"
              type="number"
              allowDecimals={false}
              label={{ value: "Iteração", position: "insideBottom", offset: -4 }}
            />
            <YAxis
              yAxisId="rms"
              label={{
                value: "RMS log₁₀",
                angle: -90,
                position: "insideLeft",
              }}
            />
            <YAxis
              yAxisId="pct"
              orientation="right"
              label={{
                value: "RMS %",
                angle: 90,
                position: "insideRight",
              }}
            />
            <Tooltip
              formatter={(value, name) => {
                const v = typeof value === "number" ? value : Number(value);
                const label = String(name ?? "");
                if (!Number.isFinite(v)) return ["—", label];
                if (label === "RMS %") return [`${v.toFixed(2)} %`, label];
                if (label === "λ") return [v.toExponential(2), label];
                return [v.toFixed(5), label];
              }}
            />
            <Legend />
            <Line
              yAxisId="rms"
              type="monotone"
              dataKey="rmsLog10"
              name="RMS log₁₀"
              stroke="#0d9488"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="rmsPercent"
              name="RMS %"
              stroke="#ea580c"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
            <Line
              yAxisId="rms"
              type="monotone"
              dataKey="lambda"
              name="λ"
              stroke="#6366f1"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
