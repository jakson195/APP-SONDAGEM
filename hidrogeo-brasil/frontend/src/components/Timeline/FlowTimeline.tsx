import { useEffect, useRef } from "react";
import { getApiBase } from "../../lib/api-base";
import { useMapToolsStore } from "../../store/mapToolsStore";

export function FlowTimeline() {
  const {
    flowMonth,
    animateFlow,
    flowPlaying,
    flowLabel,
    flowByBasin,
    setFlowMonth,
    setAnimateFlow,
    setFlowPlaying,
    setFlowData,
  } = useMapToolsStore();
  const timerRef = useRef<number | null>(null);

  const loadMonth = async (month: number) => {
    try {
      const res = await fetch(`${getApiBase()}/hydro/flow-index?month=${month}`);
      const data = (await res.json()) as {
        byBasin: Record<string, number>;
        default: number;
        label: string;
      };
      setFlowData(data.byBasin, data.default, data.label);
      setFlowMonth(month);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (animateFlow) void loadMonth(flowMonth);
  }, [animateFlow]);

  useEffect(() => {
    if (!flowPlaying || !animateFlow) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    timerRef.current = window.setInterval(() => {
      const m = useMapToolsStore.getState().flowMonth;
      const next = (m % 12) + 1;
      void loadMonth(next);
    }, 1200);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [flowPlaying, animateFlow]);

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-10 w-80 rounded-xl border border-white/10 bg-[#0c1220]/90 p-3 shadow-xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-200">
          <input
            type="checkbox"
            checked={animateFlow}
            onChange={(e) => {
              setAnimateFlow(e.target.checked);
              if (e.target.checked) void loadMonth(flowMonth);
            }}
          />
          Animação vazão ANA
        </label>
        {animateFlow && (
          <button
            type="button"
            onClick={() => setFlowPlaying(!flowPlaying)}
            className="rounded bg-sky-700 px-2 py-0.5 text-[10px] text-white"
          >
            {flowPlaying ? "⏸ Pausar" : "▶ Play"}
          </button>
        )}
      </div>

      {animateFlow && (
        <>
          <div className="mb-1 flex justify-between text-[10px] text-slate-400">
            <span>{flowLabel}</span>
            <span>Índice médio bacias</span>
          </div>
          <input
            type="range"
            min={1}
            max={12}
            value={flowMonth}
            onChange={(e) => void loadMonth(Number(e.target.value))}
            className="w-full accent-sky-500"
          />
          <div className="mt-2 flex h-2 overflow-hidden rounded-full">
            <div className="flex-1 bg-gradient-to-r from-sky-200 to-sky-900" title="Seca → Cheia" />
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Azul claro = vazão baixa · Azul escuro = cheia (média histórica ANA)
          </p>
          {Object.keys(flowByBasin).length > 0 && (
            <ul className="mt-2 max-h-20 overflow-y-auto text-[10px] text-slate-400">
              {Object.entries(flowByBasin)
                .slice(0, 4)
                .map(([b, v]) => (
                  <li key={b}>
                    {b}: {(v * 100).toFixed(0)}%
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
