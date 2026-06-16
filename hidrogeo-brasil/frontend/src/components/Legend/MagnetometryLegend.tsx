import { useLayerStore } from "../../store/layerStore";
import {
  MAGNETOMETRY_ANOMALY_LEGEND,
  MAGNETOMETRY_TERNARY_LEGEND,
  type MagnetometryLegendBlock,
} from "../../layers/magnetometry-legend";

function LegendBlock({ block }: { block: MagnetometryLegendBlock }) {
  return (
    <div className="border-t border-white/10 pt-2 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-semibold text-violet-200">{block.title}</p>
      <p className="mb-2 text-[10px] text-slate-500">{block.subtitle}</p>

      {block.items && (
        <ul className="space-y-1.5">
          {block.items.map((item) => (
            <li key={item.label} className="flex items-start gap-2 text-[10px]">
              <span
                className="mt-0.5 h-3 w-3 shrink-0 rounded-sm ring-1 ring-white/20"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <span className="text-slate-300">
                {item.label}
                {item.hint && (
                  <span className="block text-slate-500">{item.hint}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {block.gradient && (
        <div className="space-y-1">
          <div
            className="h-3 w-full rounded-sm ring-1 ring-white/15"
            style={{
              background: block.gradient.mid
                ? `linear-gradient(to right, ${block.gradient.from}, ${block.gradient.mid}, ${block.gradient.to})`
                : `linear-gradient(to right, ${block.gradient.from}, ${block.gradient.to})`,
            }}
          />
          <div className="flex justify-between text-[9px] text-slate-500">
            {block.gradient.labels.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          <p className="text-[9px] text-slate-500">Unidade: nT (nanotesla)</p>
        </div>
      )}
    </div>
  );
}

export function MagnetometryLegend() {
  const visible = useLayerStore((s) => s.visible);
  const showTernary = visible.magnetometry_ternary;
  const showAnomaly = visible.magnetometry_anomaly;

  if (!showTernary && !showAnomaly) return null;

  return (
    <aside
      className="pointer-events-auto w-full rounded-xl border border-violet-500/25 bg-[#0c1220]/90 p-3 shadow-2xl backdrop-blur-md"
      aria-label="Legenda magnetometria"
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-violet-300/90">
        Legenda · Magnetometria
      </p>

      <div className="space-y-2">
        {showTernary && <LegendBlock block={MAGNETOMETRY_TERNARY_LEGEND} />}
        {showAnomaly && <LegendBlock block={MAGNETOMETRY_ANOMALY_LEGEND} />}
      </div>

      <p className="mt-2 border-t border-white/5 pt-2 text-[9px] leading-snug text-slate-500">
        Fonte: CPRM/SGB · Mapas_Tern_Mag · ~51% do território
      </p>
    </aside>
  );
}
