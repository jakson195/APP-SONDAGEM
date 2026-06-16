import { CloudRain, Gauge, TrendingUp, TriangleAlert } from "lucide-react";
import type { KpiSnapshot } from "../../types";
import clsx from "clsx";

type Props = { kpis: KpiSnapshot; floodStageM: number };

function KpiCard({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  icon: typeof Gauge;
  accent: "water" | "rain" | "peak" | "alert";
}) {
  const colors = {
    water: "text-water-light ring-water/25 bg-water/10",
    rain: "text-sky-300 ring-sky-500/25 bg-sky-500/10",
    peak: "text-attention ring-attention/25 bg-attention/10",
    alert: "text-danger ring-danger/25 bg-danger/10",
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4 ring-1 ring-white/5">
      <div className="mb-3 flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <div className={clsx("rounded-lg p-2 ring-1", colors[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="font-data text-2xl font-semibold tabular-nums text-white">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-muted">{unit}</span>
        )}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function KpiCards({ kpis, floodStageM }: Props) {
  const pct = Math.round((kpis.currentLevelM / floodStageM) * 100);
  const status =
    pct >= 95 ? "danger" : pct >= 75 ? "attention" : "normal";

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Nível atual"
        value={kpis.currentLevelM.toFixed(2)}
        unit="m"
        sub={`${pct}% da cota (${floodStageM} m)`}
        icon={Gauge}
        accent="water"
      />
      <KpiCard
        label="Chuva 24 h"
        value={kpis.rain24hMm.toFixed(1)}
        unit="mm"
        sub="OpenMeteo + estações"
        icon={CloudRain}
        accent="rain"
      />
      <KpiCard
        label="Pico previsto LSTM"
        value={kpis.peakPredictedM.toFixed(2)}
        unit="m"
        sub={`ETA ~${kpis.peakEtaHours}h · horizonte 24h`}
        icon={TrendingUp}
        accent="peak"
      />
      <KpiCard
        label="Alertas activos"
        value={String(kpis.activeAlerts)}
        sub={
          status === "danger"
            ? "Perigo — acima de 95% cota"
            : status === "attention"
              ? "Atenção — monitorar"
              : "Situação estável"
        }
        icon={TriangleAlert}
        accent="alert"
      />
    </div>
  );
}
