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
import type { LevelPoint } from "../../types";

type Props = {
  data: LevelPoint[];
  floodStageM: number;
};

export function LevelChart({ data, floodStageM }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.time).toLocaleString("pt-BR", {
      day: "2-digit",
      hour: "2-digit",
    }),
  }));

  return (
    <div className="rounded-xl border border-border bg-surface p-4 ring-1 ring-white/5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Nível observado vs. previsto</h2>
          <p className="text-xs text-muted">LSTM · horizontes 6h / 12h / 24h</p>
        </div>
        <div className="font-data text-[10px] text-muted">
          Cota inundação:{" "}
          <span className="text-danger">{floodStageM.toFixed(1)} m</span>
        </div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e3a5f" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#1e3a5f" }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "#64748b", fontSize: 10, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={false}
              unit=" m"
            />
            <Tooltip
              contentStyle={{
                background: "#0f2040",
                border: "1px solid #1e3a5f",
                borderRadius: 8,
                fontSize: 11,
                fontFamily: "JetBrains Mono",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
            <Line
              type="monotone"
              dataKey="observed"
              name="Observado (ANA)"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="predicted6h"
              name="Previsto 6h"
              stroke="#22c55e"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="predicted24h"
              name="Previsto 24h"
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="2 6"
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
