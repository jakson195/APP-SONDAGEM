import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { getApiBase } from "../../lib/api-base";
import { useMapToolsStore } from "../../store/mapToolsStore";
import type { FeatureInfo } from "../../types";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  mode?: "ai" | "offline";
};

type PanelPos = { x: number; y: number };

type Props = {
  feature: FeatureInfo | null;
  cursor: { lon: number; lat: number };
};

const POS_KEY = "hidrogeo-geology-chat-pos";
const PANEL_W = 380;
const PANEL_H = 420;
const COLLAPSED_H = 40;

function defaultPos(): PanelPos {
  if (typeof window === "undefined") return { x: 12, y: 400 };
  return { x: 12, y: Math.max(72, window.innerHeight - PANEL_H - 72) };
}

function loadPos(): PanelPos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as PanelPos;
      if (typeof p.x === "number" && typeof p.y === "number") return p;
    }
  } catch {
    /* ignore */
  }
  return defaultPos();
}

function clampPos(p: PanelPos, w: number, h: number): PanelPos {
  if (typeof window === "undefined") return p;
  return {
    x: Math.max(8, Math.min(p.x, window.innerWidth - w - 8)),
    y: Math.max(8, Math.min(p.y, window.innerHeight - h - 8)),
  };
}

function savePos(p: PanelPos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function contextFromFeature(feature: FeatureInfo | null, cursor: { lon: number; lat: number }) {
  if (!feature || feature.layer !== "lithology") {
    return feature
      ? {
          layer: feature.layer,
          name: feature.name,
          lon: cursor.lon,
          lat: cursor.lat,
        }
      : { lon: cursor.lon, lat: cursor.lat };
  }
  return {
    layer: "lithology",
    unit_name: feature.unit_name ?? feature.name,
    sigla: feature.sigla,
    rock_type: feature.rock_type,
    litotipos: feature.litotipos,
    age: feature.age,
    ambiente_tectonico: feature.ambiente_tectonico,
    description: feature.description,
    geology_summary: feature.geology_summary,
    mapa_fonte: feature.mapa_fonte,
    escala: feature.escala,
    lon: cursor.lon,
    lat: cursor.lat,
  };
}

function useDraggablePanel(open: boolean) {
  const [pos, setPos] = useState<PanelPos>(() => clampPos(loadPos(), PANEL_W, open ? PANEL_H : COLLAPSED_H));
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPos(p, PANEL_W, open ? PANEL_H : COLLAPSED_H));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return;
      movedRef.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
      const h = open ? PANEL_H : COLLAPSED_H;
      setPos(clampPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy }, PANEL_W, h));
    },
    [open],
  );

  const onPointerUp = useCallback((e: PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setPos((p) => {
      savePos(p);
      return p;
    });
  }, []);

  return { pos, movedRef, onPointerDown, onPointerMove, onPointerUp };
}

export function GeologyChatPanel({ feature, cursor }: Props) {
  const open = useMapToolsStore((s) => s.geologyChatOpen);
  const setOpen = useMapToolsStore((s) => s.setGeologyChatOpen);
  const { pos, movedRef, onPointerDown, onPointerMove, onPointerUp } = useDraggablePanel(open);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [aiSetup, setAiSetup] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Olá! Pergunte sobre litologia, idade, ambiente tectônico ou unidades CPRM/SGB. Clique no mapa com litologia activa para contextualizar.",
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${getApiBase()}/geology/chat/status`)
      .then((r) => r.json())
      .then((d: { aiEnabled?: boolean; setup?: string | null; hint?: string }) => {
        setAiEnabled(Boolean(d.aiEnabled));
        setAiSetup(d.setup ?? null);
      })
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    try {
      const history = [...messages, userMsg].slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch(`${getApiBase()}/geology/chat/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          lon: cursor.lon,
          lat: cursor.lat,
          context: contextFromFeature(feature, cursor),
          history,
        }),
      });
      if (!res.ok) throw new Error("Falha na resposta");
      const data = (await res.json()) as { answer: string; mode?: "ai" | "offline" };
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.answer, mode: data.mode ?? "offline" },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Não foi possível contactar a API de geologia. Verifique se o backend está activo.",
          mode: "offline",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [cursor, feature, input, loading, messages]);

  if (!open) {
    return (
      <button
        type="button"
        style={{ left: pos.x, top: pos.y }}
        onClick={() => {
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          setOpen(true);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="pointer-events-auto fixed z-10 flex cursor-grab touch-none items-center gap-2 rounded-xl border border-amber-500/35 bg-[#0c1220]/90 px-3 py-2 text-xs font-medium text-amber-100 shadow-xl backdrop-blur-md hover:bg-amber-950/40 active:cursor-grabbing"
        title="Terminal de geologia — arraste para posicionar, clique para abrir"
      >
        🪨 Geologia IA
        {aiEnabled === true && (
          <span className="rounded-full bg-emerald-500/25 px-1.5 py-0.5 text-[9px] text-emerald-300">GPT</span>
        )}
      </button>
    );
  }

  return (
    <aside
      style={{ left: pos.x, top: pos.y, width: PANEL_W, height: `min(${PANEL_H}px, calc(100vh - 4rem))` }}
      className="pointer-events-auto fixed z-20 flex flex-col overflow-hidden rounded-xl border border-amber-500/30 bg-[#0a0f18]/95 shadow-2xl backdrop-blur-md"
    >
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex cursor-grab touch-none select-none items-center justify-between border-b border-white/10 px-3 py-2 active:cursor-grabbing"
      >
        <div>
          <p className="text-xs font-bold text-amber-200">Terminal · Geologia</p>
          <p className="text-[10px] text-slate-500">
            {aiEnabled ? "IA activa (OpenAI)" : "Modo offline — dados CPRM do mapa"}
            {feature?.layer === "lithology" && feature.unit_name ? ` · ${feature.unit_name}` : ""}
          </p>
          {!aiEnabled && aiSetup && (
            <p className="mt-1 max-w-[240px] text-[9px] leading-snug text-amber-200/80">{aiSetup}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer text-slate-400 hover:text-white"
          aria-label="Fechar"
        >
          ✕
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`mb-3 whitespace-pre-wrap ${m.role === "user" ? "text-sky-200" : "text-slate-300"}`}
          >
            <span className="mr-1 select-none text-slate-500">
              {m.role === "user" ? "›" : m.mode === "ai" ? "◆" : "○"}
            </span>
            {m.content}
          </div>
        ))}
        {loading && <p className="animate-pulse text-slate-500">A analisar…</p>}
      </div>

      <form
        className="border-t border-white/10 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ex.: Qual a idade desta unidade?"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-500 disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      </form>
    </aside>
  );
}
