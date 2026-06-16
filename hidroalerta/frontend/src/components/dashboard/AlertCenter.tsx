import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import clsx from "clsx";
import type { Alert, AlertLevel } from "../../types";

type Props = { alerts: Alert[] };

const levelConfig: Record<
  AlertLevel,
  { icon: typeof Info; label: string; className: string }
> = {
  info: {
    icon: Info,
    label: "Informativo",
    className: "border-water/30 bg-water/10 text-water-light",
  },
  attention: {
    icon: AlertTriangle,
    label: "Atenção",
    className: "border-attention/30 bg-attention/10 text-attention",
  },
  danger: {
    icon: AlertCircle,
    label: "Perigo",
    className: "border-danger/30 bg-danger/10 text-danger",
  },
};

export function AlertCenter({ alerts }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 ring-1 ring-white/5">
      <h2 className="mb-1 text-sm font-semibold text-white">Central de alertas</h2>
      <p className="mb-4 text-xs text-muted">Limiares automáticos · push FCM (mobile)</p>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {alerts.map((a) => {
          const cfg = levelConfig[a.level];
          const Icon = cfg.icon;
          const time = new Date(a.timestamp).toLocaleString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short",
          });
          return (
            <article
              key={a.id}
              className={clsx(
                "rounded-lg border p-3 transition",
                cfg.className,
                !a.read && "ring-1 ring-white/10",
              )}
            >
              <div className="mb-1 flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold">{a.title}</p>
                    {!a.read && (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">{a.message}</p>
                </div>
              </div>
              <p className="font-data text-right text-[9px] opacity-60">{time}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
