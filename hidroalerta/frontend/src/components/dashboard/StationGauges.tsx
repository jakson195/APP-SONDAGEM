import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import clsx from "clsx";
import type { Station } from "../../types";

type Props = { stations: Station[] };

function pctOfFlood(level: number, flood: number) {
  return Math.min(100, Math.round((level / flood) * 100));
}

function statusColor(pct: number) {
  if (pct >= 95) return "bg-danger";
  if (pct >= 75) return "bg-attention";
  return "bg-normal";
}

export function StationGauges({ stations }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 ring-1 ring-white/5">
      <h2 className="mb-1 text-sm font-semibold text-white">Réguas hidrométricas</h2>
      <p className="mb-4 text-xs text-muted">% da cota de inundação por estação</p>
      <div className="space-y-4">
        {stations.map((s) => {
          const pct = pctOfFlood(s.levelM, s.floodStageM);
          const TrendIcon =
            s.trend === "up" ? ArrowUp : s.trend === "down" ? ArrowDown : Minus;
          return (
            <div key={s.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-200">{s.name}</p>
                  <p className="font-data text-[10px] text-muted">{s.river}</p>
                </div>
                <div className="flex items-center gap-2">
                  <TrendIcon
                    className={clsx(
                      "h-3.5 w-3.5",
                      s.trend === "up"
                        ? "text-attention"
                        : s.trend === "down"
                          ? "text-normal"
                          : "text-muted",
                    )}
                  />
                  <span className="font-data text-sm font-semibold tabular-nums text-white">
                    {s.levelM.toFixed(2)} m
                  </span>
                  <span
                    className={clsx(
                      "font-data rounded px-1.5 py-0.5 text-[10px] font-bold",
                      pct >= 95
                        ? "bg-danger/20 text-danger"
                        : pct >= 75
                          ? "bg-attention/20 text-attention"
                          : "bg-normal/20 text-normal",
                    )}
                  >
                    {pct}%
                  </span>
                </div>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={clsx("h-full rounded-full transition-all duration-500", statusColor(pct))}
                  style={{ width: `${pct}%` }}
                />
                <div
                  className="absolute top-0 h-full w-0.5 bg-white/60"
                  style={{ left: "100%", transform: "translateX(-100%)" }}
                  title="Cota inundação"
                />
              </div>
              <p className="mt-0.5 text-right font-data text-[9px] text-muted">
                cota {s.floodStageM} m
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
