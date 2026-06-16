import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RainHour } from "../../types";

type Props = { data: RainHour[] };

export function RainForecast({ data }: Props) {
  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.hour).toLocaleString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const total = data.reduce((acc, d) => acc + d.mm, 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 ring-1 ring-white/5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Previsão de chuva</h2>
          <p className="text-xs text-muted">OpenMeteo · próximas 36 h</p>
        </div>
        <p className="font-data text-xs text-water-light">
          Σ {total.toFixed(0)} mm
        </p>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#1e3a5f" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 9 }}
              tickLine={false}
              axisLine={{ stroke: "#1e3a5f" }}
              interval={5}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              unit=" mm"
            />
            <Tooltip
              contentStyle={{
                background: "#0f2040",
                border: "1px solid #1e3a5f",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value, _name, item) => [
                `${Number(value).toFixed(1)} mm · ${item.payload.prob.toFixed(0)}% prob.`,
                "Chuva",
              ]}
            />
            <Bar dataKey="mm" fill="#0ea5e9" radius={[2, 2, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
