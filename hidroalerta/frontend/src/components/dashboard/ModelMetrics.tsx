import type { KpiSnapshot } from "../../types";

type Props = { kpis: KpiSnapshot };

function MetricBar({
  label,
  value,
  max,
  good,
}: {
  label: string;
  value: number;
  max: number;
  good: boolean;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={good ? "font-data text-normal" : "font-data text-attention"}>
          {value.toFixed(2)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${good ? "bg-normal" : "bg-attention"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ModelMetrics({ kpis }: Props) {
  const nseGood = kpis.modelNse >= 0.75;
  const rmseGood = kpis.modelRmse <= 0.5;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 ring-1 ring-white/5">
      <h2 className="mb-1 text-sm font-semibold text-white">Métricas do modelo LSTM</h2>
      <p className="mb-4 text-xs text-muted">MLflow · última validação cruzada</p>
      <div className="space-y-4">
        <MetricBar label="NSE (Nash-Sutcliffe)" value={kpis.modelNse} max={1} good={nseGood} />
        <MetricBar label="RMSE (m)" value={kpis.modelRmse} max={1} good={rmseGood} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 text-[10px]">
        <div>
          <dt className="text-muted">Arquitectura</dt>
          <dd className="font-data text-slate-300">LSTM 2×128</dd>
        </div>
        <div>
          <dt className="text-muted">Horizontes</dt>
          <dd className="font-data text-slate-300">6h · 12h · 24h</dd>
        </div>
        <div>
          <dt className="text-muted">Features</dt>
          <dd className="font-data text-slate-300">nível + chuva lag</dd>
        </div>
        <div>
          <dt className="text-muted">Último treino</dt>
          <dd className="font-data text-slate-300">há 2 dias</dd>
        </div>
      </dl>
    </div>
  );
}
