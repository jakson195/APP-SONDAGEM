import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useLayerStore } from "../../store/layerStore";import { getApiBase } from "../../lib/api-base";
import { filterLayerGroupsForApp, mergeLayerGroups } from "../../layers/layerCatalog";
import type { LayerGroup } from "../../types";

const GROUP_ICONS: Record<string, string> = {
  hydro: "🌊",
  geo: "🪨",
  geophysics: "🧲",
  admin: "🗺️",
  mining: "⛏️",
  geotech: "⛰️",
  risk: "⚠️",
  base: "🛰️",
};

export function LayerPanel() {
  const [groups, setGroups] = useState<LayerGroup[]>([]);
  const {
    visible,
    opacity,
    basemap,
    setVisible,
    setOpacity,
    setMiningEnabled,
    isMiningEnabled,
    setBasemap,
  } = useLayerStore(
    useShallow((s) => ({
      visible: s.visible,
      opacity: s.opacity,
      basemap: s.basemap,
      setVisible: s.setVisible,
      setOpacity: s.setOpacity,
      setMiningEnabled: s.setMiningEnabled,
      isMiningEnabled: s.isMiningEnabled,
      setBasemap: s.setBasemap,
    })),
  );
  const miningOn = isMiningEnabled();
  useEffect(() => {
    fetch(`${getApiBase()}/layers`)
      .then((r) => r.json())
      .then((data: { groups: LayerGroup[]; basemaps: { id: string; label: string }[] }) => {
        const merged = filterLayerGroupsForApp(mergeLayerGroups(data.groups ?? []));
        setGroups(merged);
      })
      .catch(() => {
        setGroups(filterLayerGroupsForApp(mergeLayerGroups([])));
      });
  }, []);

  return (
    <aside className="pointer-events-auto absolute left-3 top-3 z-10 w-72 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-xl border border-white/10 bg-[#0c1220]/80 p-3 shadow-2xl backdrop-blur-md">
      <div className="mb-3 border-b border-white/10 pb-2">
        <h1 className="text-sm font-bold tracking-wide text-lime-300">HidroGeo Brasil</h1>
        <p className="text-[10px] text-slate-400">Mapa 2D · ANA + CPRM + ANM</p>

        <>
          <label className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-2 text-xs font-medium text-amber-100 shadow-sm">
            <span>⛏️ Dados ANM (SIGMINE)</span>
            <input
              type="checkbox"
              checked={miningOn}
              onChange={(e) => setMiningEnabled(e.target.checked)}
              className="h-4 w-4 accent-amber-400"
              aria-label="Activar dados ANM"
            />
          </label>
          <p className="mt-1 text-[10px] text-slate-500">
            {miningOn
              ? "Clique num polígono ANM → painel à direita com processo, fase e titular."
              : "Active para ver mineração no mapa."}
          </p>
        </>
      </div>

      {groups.map((g) => (
        <details
          key={g.id}
          open={
            g.id === "hydro" ||
            g.id === "geo" ||
            g.id === "admin" ||
            g.id === "mining"
          }
          className="mb-2 group"
        >
          <summary className="cursor-pointer list-none text-xs font-semibold text-slate-200">
            {GROUP_ICONS[g.id] ?? "📁"} {g.label}
          </summary>
          {g.id === "mining" && (
            <p className="mt-1 px-1 text-[10px] text-amber-200/70">
              Use o interruptor ANM no topo para ligar/desligar todas, ou marque camadas individualmente.
            </p>
          )}          <ul className={`mt-1 space-y-2 pl-1 ${g.id === "mining" && !miningOn ? "opacity-70" : ""}`}>
            {(g.layers ?? []).map((l) => (
              <li key={l.id} className="rounded-lg bg-white/5 px-2 py-1.5">
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(visible[l.id])}
                    disabled={l.status === "planned"}
                    onChange={(e) => setVisible(l.id, e.target.checked)}
                  />                  <span className={l.status === "planned" ? "opacity-50" : ""}>
                    {l.label}
                    {l.status === "planned" ? " (breve)" : ""}
                  </span>
                </label>
                {visible[l.id] && l.status !== "planned" && (
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={opacity[l.id] ?? 0.85}
                    onChange={(e) => setOpacity(l.id, Number(e.target.value))}
                    className="mt-1 w-full accent-sky-500"
                    title="Opacidade"
                  />
                )}
              </li>
            ))}
          </ul>
        </details>
      ))}

      <details open className="mb-2">
        <summary className="cursor-pointer text-xs font-semibold text-slate-200">🛰️ Base</summary>        <div className="mt-1 space-y-1 pl-1">
          {(["satellite", "terrain", "dark"] as const).map((b) => (
            <label key={b} className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="radio"
                name="basemap"
                checked={basemap === b}
                onChange={() => setBasemap(b)}
              />
              {b === "satellite" ? "Satélite" : b === "terrain" ? "Terreno" : "Escuro"}
            </label>
          ))}
        </div>
      </details>

      <div className="mt-2 border-t border-white/10 pt-2 text-[10px] text-slate-500">
        Clique no mapa → geologia · hidrologia · ANM · limites IBGE
      </div>
    </aside>
  );
}
