import { useLayerStore } from "../../store/layerStore";
import { STREAM_CATEGORY_IDS, STREAM_CATEGORY_META } from "../../layers/stream-categories";
import { streamCategoryColor } from "../../layers/hydrography";

function rgbaCss([r, g, b]: [number, number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function StreamCategoryLegend() {
  const visible = useLayerStore((s) => s.visible);
  const active = STREAM_CATEGORY_IDS.filter((id) => visible[id]);

  if (active.length === 0) return null;

  return (
    <aside
      className="pointer-events-auto w-full rounded-xl border border-sky-500/25 bg-[#0c1220]/90 p-3 shadow-2xl backdrop-blur-md"
      aria-label="Legenda córregos por categoria"
    >
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-sky-300/90">
        Legenda · Córregos
      </p>

      <ul className="space-y-1.5">
        {STREAM_CATEGORY_IDS.map((id) => {
          const meta = STREAM_CATEGORY_META[id];
          const [r, g, b] = streamCategoryColor(meta.category);
          const isOn = visible[id];
          return (
            <li
              key={id}
              className={`flex items-start gap-2 text-[10px] ${isOn ? "text-slate-300" : "text-slate-600"}`}
            >
              <span
                className="mt-0.5 h-3 w-6 shrink-0 rounded-sm ring-1 ring-white/20"
                style={{ backgroundColor: rgbaCss([r, g, b, 255]) }}
                aria-hidden
              />
              <span>
                {meta.label}
                <span className="block text-slate-500">{meta.description}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 border-t border-white/5 pt-2 text-[9px] leading-snug text-slate-500">
        1ª–4ª categoria ≈ ordem Strahler 1–4 · HydroRIVERS v1.0
      </p>
    </aside>
  );
}
