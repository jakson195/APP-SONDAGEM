import { Bell, RefreshCw, Search } from "lucide-react";
import { BASIN_NAME } from "../../data/mockData";

type Props = {
  lastUpdate: string;
  onRefresh?: () => void;
  unreadAlerts: number;
};

export function Topbar({ lastUpdate, onRefresh, unreadAlerts }: Props) {
  const time = new Date(lastUpdate).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-bg/90 px-6 backdrop-blur-md">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold text-white">Dashboard de Previsão</h1>
        <p className="truncate text-xs text-muted">{BASIN_NAME}</p>
      </div>

      <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 sm:flex">
        <Search className="h-3.5 w-3.5 text-muted" />
        <input
          type="search"
          placeholder="Buscar estação…"
          className="w-40 bg-transparent text-xs text-slate-300 outline-none placeholder:text-slate-600"
        />
      </div>

      <p className="font-data hidden text-[11px] text-muted md:block">
        Atualizado <span className="text-water-light">{time}</span>
      </p>

      <button
        type="button"
        onClick={onRefresh}
        className="rounded-lg border border-border p-2 text-slate-400 transition hover:border-water/40 hover:text-water-light"
        title="Atualizar"
      >
        <RefreshCw className="h-4 w-4" />
      </button>

      <button
        type="button"
        className="relative rounded-lg border border-border p-2 text-slate-400 transition hover:border-water/40 hover:text-water-light"
      >
        <Bell className="h-4 w-4" />
        {unreadAlerts > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">
            {unreadAlerts}
          </span>
        )}
      </button>
    </header>
  );
}
