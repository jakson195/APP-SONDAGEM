import {
  Activity,
  AlertTriangle,
  BarChart3,
  Droplets,
  Layers,
  Map,
  Radio,
  Settings,
  Smartphone,
  Waves,
} from "lucide-react";
import clsx from "clsx";

const nav = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3, active: true },
  { id: "map", label: "Mapa de inundação", icon: Map, active: false },
  { id: "stations", label: "Estações", icon: Radio, active: false },
  { id: "alerts", label: "Alertas", icon: AlertTriangle, active: false },
  { id: "model", label: "Modelo LSTM", icon: Activity, active: false },
  { id: "simulation", label: "HEC-RAS", icon: Layers, active: false },
  { id: "mobile", label: "App campo", icon: Smartphone, active: false },
  { id: "settings", label: "Configurações", icon: Settings, active: false },
];

type Props = {
  alertCount: number;
};

export function Sidebar({ alertCount }: Props) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-water/15 ring-1 ring-water/30">
          <Droplets className="h-5 w-5 text-water-light" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight text-white">HidroAlerta</p>
          <p className="text-[10px] uppercase tracking-widest text-muted">Enchentes · MVP</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            className={clsx(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
              item.active
                ? "bg-water/15 font-medium text-water-light"
                : "text-slate-400 hover:bg-surface-2 hover:text-slate-200",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.id === "alerts" && alertCount > 0 && (
              <span className="font-data rounded-full bg-danger/20 px-2 py-0.5 text-[10px] font-semibold text-danger">
                {alertCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="border-t border-border p-4">
        <div className="rounded-lg bg-surface-2 p-3 ring-1 ring-border">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <Waves className="h-3.5 w-3.5 text-water" />
            <span>WebSocket</span>
            <span className="ml-auto flex items-center gap-1 text-normal">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-normal" />
              live
            </span>
          </div>
          <p className="font-data text-[10px] leading-relaxed text-slate-500">
            Dados mock · ANA + OpenMeteo
          </p>
        </div>
      </div>
    </aside>
  );
}
