"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  linhasRotativaToPerfil,
  normalizeRotativaDadosCampo,
} from "@/components/rotativa-registro-campo";
import type { CamadaEstratigrafica } from "@/components/perfil-estratigrafico";
import { apiUrl } from "@/lib/api-url";

type ObraListItem = {
  id: number;
  nome: string;
  cliente: string;
};

type FuroItem = {
  id: number;
  codigo: string;
  tipo?: string;
};

type FuroDetalhe = {
  id: number;
  codigo: string;
  dadosCampo?: unknown;
};

type FuroPerfil = {
  id: number;
  codigo: string;
  camadas: CamadaEstratigrafica[];
};

type Ligacao = {
  key: string;
  leftFuroId: number;
  rightFuroId: number;
  leftX: number;
  rightX: number;
  leftTopoM: number;
  leftBaseM: number;
  rightTopoM: number;
  rightBaseM: number;
  cor: string;
  material: string;
  unidade: string;
};

const PX_PER_M = 42;
const COL_W = 74;
const COL_GAP = 190;
const PAD_TOP = 24;
const PAD_LEFT = 34;
const MIN_THICK_M = 0.15;

type CorrelacaoOverride = Record<
  string,
  {
    topDeltaM: number;
    baseDeltaM: number;
  }
>;

type DragState = {
  key: string;
  edge: "top" | "base";
  startY: number;
  startDeltaM: number;
} | null;

function normMat(s: string): string {
  return s.trim().toLowerCase();
}

function unidadeFromMaterial(material: string): string {
  const m = material.trim();
  const token = m.match(/^([A-Za-z]{1,3}\d{0,3})\s*[-:]/);
  if (token?.[1]) return token[1].toUpperCase();
  const firstWord = m.split(/\s+/)[0] ?? "";
  return firstWord.toUpperCase() || "SEM_UNIDADE";
}

function overlap(aTop: number, aBase: number, bTop: number, bBase: number): number {
  return Math.max(0, Math.min(aBase, bBase) - Math.max(aTop, bTop));
}

function buildLigacoes(furos: FuroPerfil[]): Ligacao[] {
  const out: Ligacao[] = [];
  for (let i = 0; i < furos.length - 1; i += 1) {
    const left = furos[i];
    const right = furos[i + 1];
    if (!left || !right) continue;
    const leftX = PAD_LEFT + i * (COL_W + COL_GAP);
    const rightX = PAD_LEFT + (i + 1) * (COL_W + COL_GAP);

    for (const a of left.camadas) {
      const matA = normMat(a.material);
      let best: CamadaEstratigrafica | null = null;
      let bestOverlap = 0;
      for (const b of right.camadas) {
        if (normMat(b.material) !== matA) continue;
        const ov = overlap(a.topo, a.base, b.topo, b.base);
        if (ov > bestOverlap) {
          bestOverlap = ov;
          best = b;
        }
      }
      if (!best) continue;
      const unidade = unidadeFromMaterial(a.material);
      const key = `${left.id}-${right.id}-${unidade}-${Math.round(a.topo * 100)}-${Math.round(a.base * 100)}`;
      out.push({
        key,
        leftFuroId: left.id,
        rightFuroId: right.id,
        leftX: leftX + COL_W,
        rightX,
        leftTopoM: a.topo,
        leftBaseM: a.base,
        rightTopoM: best.topo,
        rightBaseM: best.base,
        cor: a.cor || "#d4d4d8",
        material: a.material,
        unidade,
      });
    }
  }
  return out;
}

export default function RotativaPerfilGeologicoPage() {
  const searchParams = useSearchParams();
  const obraIdQuery = Number(searchParams.get("obraId") || "");
  const [obras, setObras] = useState<ObraListItem[]>([]);
  const [obraId, setObraId] = useState<number | null>(
    Number.isFinite(obraIdQuery) ? obraIdQuery : null,
  );
  const [furos, setFuros] = useState<FuroPerfil[]>([]);
  const [corrOverride, setCorrOverride] = useState<CorrelacaoOverride>({});
  const [drag, setDrag] = useState<DragState>(null);
  const [smoothFactor, setSmoothFactor] = useState(0.55);
  const [selectedUnidade, setSelectedUnidade] = useState<string>("__ALL__");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(apiUrl("/api/obra"));
        const data = await r.json();
        if (cancelled || !r.ok || !Array.isArray(data)) return;
        const lista = data as ObraListItem[];
        setObras(lista);
        if (obraId == null && lista[0]?.id != null) setObraId(lista[0].id);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [obraId]);

  const carregar = useCallback(async (oid: number) => {
    setLoading(true);
    setErro(null);
    try {
      const rList = await fetch(apiUrl(`/api/obra/${oid}/furos/rotativa`));
      const listaRaw = (await rList.json().catch(() => [])) as unknown;
      if (!rList.ok || !Array.isArray(listaRaw)) {
        setErro("Não foi possível carregar os SR desta obra.");
        setFuros([]);
        return;
      }

      const lista = (listaRaw as FuroItem[]).slice(0, 24);
      const detalhes = await Promise.all(
        lista.map(async (f): Promise<FuroPerfil | null> => {
          const rf = await fetch(apiUrl(`/api/furo/${f.id}`));
          const jf = (await rf.json().catch(() => ({}))) as FuroDetalhe;
          if (!rf.ok) return null;
          const dc = normalizeRotativaDadosCampo(jf.dadosCampo);
          const camadas = linhasRotativaToPerfil(dc?.linhas ?? []);
          return { id: f.id, codigo: jf.codigo ?? f.codigo, camadas };
        }),
      );
      setFuros(detalhes.filter((x): x is FuroPerfil => x != null));
      setCorrOverride({});
      setDrag(null);
      setSelectedUnidade("__ALL__");
    } catch {
      setErro("Falha de rede ao montar perfil geológico.");
      setFuros([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (obraId != null && Number.isFinite(obraId)) {
      void carregar(obraId);
    } else {
      setFuros([]);
    }
  }, [obraId, carregar]);

  const depthMax = useMemo(
    () =>
      Math.max(
        6,
        ...furos.flatMap((f) => f.camadas.map((c) => c.base)),
      ),
    [furos],
  );

  const ligacoes = useMemo(() => buildLigacoes(furos), [furos]);
  const unidades = useMemo(
    () => Array.from(new Set(ligacoes.map((l) => l.unidade))).sort((a, b) => a.localeCompare(b)),
    [ligacoes],
  );
  const svgW = PAD_LEFT * 2 + furos.length * COL_W + Math.max(0, furos.length - 1) * COL_GAP;
  const svgH = PAD_TOP * 2 + depthMax * PX_PER_M;
  const obraNome = obras.find((o) => o.id === obraId)?.nome ?? "—";

  const ligacoesAjustadas = useMemo(
    () =>
      ligacoes.map((l) => {
        const ov = corrOverride[l.key];
        const rightTopoM = l.rightTopoM + (ov?.topDeltaM ?? 0);
        let rightBaseM = l.rightBaseM + (ov?.baseDeltaM ?? 0);
        if (rightBaseM - rightTopoM < MIN_THICK_M) {
          rightBaseM = rightTopoM + MIN_THICK_M;
        }
        return {
          ...l,
          rightTopoM,
          rightBaseM,
          leftTopoY: PAD_TOP + l.leftTopoM * PX_PER_M,
          leftBaseY: PAD_TOP + l.leftBaseM * PX_PER_M,
          rightTopoY: PAD_TOP + rightTopoM * PX_PER_M,
          rightBaseY: PAD_TOP + rightBaseM * PX_PER_M,
        };
      }),
    [ligacoes, corrOverride],
  );

  const toY = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return e.clientY;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()?.inverse()).y;
  }, []);

  function beginDrag(
    e: React.PointerEvent<SVGCircleElement>,
    key: string,
    edge: "top" | "base",
  ) {
    e.preventDefault();
    const ov = corrOverride[key];
    const startDeltaM = edge === "top" ? ov?.topDeltaM ?? 0 : ov?.baseDeltaM ?? 0;
    setDrag({ key, edge, startY: toY(e), startDeltaM });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent<SVGCircleElement>) {
    if (!drag) return;
    const yNow = toY(e);
    const deltaM = (yNow - drag.startY) / PX_PER_M;
    setCorrOverride((prev) => {
      const curr = prev[drag.key] ?? { topDeltaM: 0, baseDeltaM: 0 };
      const next =
        drag.edge === "top"
          ? { ...curr, topDeltaM: drag.startDeltaM + deltaM }
          : { ...curr, baseDeltaM: drag.startDeltaM + deltaM };
      return { ...prev, [drag.key]: next };
    });
  }

  function endDrag(e: React.PointerEvent<SVGCircleElement>) {
    if (!drag) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
  }

  return (
    <div className="space-y-5 p-6 text-[var(--text)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">PERFIL geológico</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Interpretação geológica entre SR (correlações por litologia).
          </p>
        </div>
        <Link
          href={obraId != null ? `/rotativa?obraId=${obraId}` : "/rotativa"}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          ← Voltar para Sondagem rotativa
        </Link>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <label className="block text-sm font-medium" htmlFor="rot-perfil-obra">
          Obra
        </label>
        <select
          id="rot-perfil-obra"
          value={obraId ?? ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            setObraId(Number.isFinite(v) ? v : null);
          }}
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-sm"
        >
          <option value="">— Escolher obra —</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome} — {o.cliente}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Obra: <strong className="text-[var(--text)]">{obraNome}</strong> ·
          SR usados: {furos.length}
        </p>
      </div>

      {!loading && furos.length >= 2 && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium" htmlFor="rot-perfil-smooth">
              Suavização das superfícies
            </label>
            <input
              id="rot-perfil-smooth"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={smoothFactor}
              onChange={(e) => setSmoothFactor(Number(e.target.value))}
            />
            <span className="text-xs text-[var(--muted)]">{Math.round(smoothFactor * 100)}%</span>
            <button
              type="button"
              onClick={() => setCorrOverride({})}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              Resetar correlações manuais
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Unidade geológica:</span>
            <button
              type="button"
              onClick={() => setSelectedUnidade("__ALL__")}
              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                selectedUnidade === "__ALL__"
                  ? "bg-teal-600 text-white"
                  : "border border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              Todas
            </button>
            {unidades.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setSelectedUnidade(u)}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${
                  selectedUnidade === u
                    ? "bg-teal-600 text-white"
                    : "border border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-[var(--muted)]">A montar perfil geológico…</p>}
      {erro && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      )}

      {!loading && !erro && furos.length < 2 && (
        <p className="text-sm text-[var(--muted)]">
          Precisa de pelo menos 2 SR com dados de camadas para desenhar a interpretação.
        </p>
      )}

      {!loading && furos.length >= 2 && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <svg width={svgW} height={svgH} role="img" aria-label="Perfil geológico entre SR">
            <defs>
              <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#9ca3af" strokeWidth="1" />
              </pattern>
            </defs>

            {Array.from({ length: Math.floor(depthMax) + 1 }).map((_, i) => {
              const y = PAD_TOP + i * PX_PER_M;
              return (
                <g key={i}>
                  <line x1={0} y1={y} x2={svgW} y2={y} stroke="#d1d5db" strokeWidth="1" />
                  <text x={6} y={y - 3} fontSize="10" fill="#6b7280">
                    {i} m
                  </text>
                </g>
              );
            })}

            {ligacoesAjustadas.map((l) => {
              const active = selectedUnidade === "__ALL__" || selectedUnidade === l.unidade;
              const cx1 = l.leftX + (l.rightX - l.leftX) * 0.33 * smoothFactor;
              const cx2 = l.rightX - (l.rightX - l.leftX) * 0.33 * smoothFactor;
              const d = [
                `M ${l.leftX} ${l.leftTopoY}`,
                `C ${cx1} ${l.leftTopoY}, ${cx2} ${l.rightTopoY}, ${l.rightX} ${l.rightTopoY}`,
                `L ${l.rightX} ${l.rightBaseY}`,
                `C ${cx2} ${l.rightBaseY}, ${cx1} ${l.leftBaseY}, ${l.leftX} ${l.leftBaseY}`,
                "Z",
              ].join(" ");
              return (
                <g key={l.key}>
                  <path
                    d={d}
                    fill={l.cor}
                    fillOpacity={active ? 0.45 : 0.1}
                    stroke={active ? "#374151" : "#9ca3af"}
                    strokeWidth={active ? 1 : 0.6}
                  />
                  {active && (
                    <>
                      <circle
                        cx={l.rightX}
                        cy={l.rightTopoY}
                        r={5}
                        fill="#0f766e"
                        stroke="white"
                        strokeWidth={1.2}
                        style={{ cursor: "ns-resize" }}
                        onPointerDown={(e) => beginDrag(e, l.key, "top")}
                        onPointerMove={onDragMove}
                        onPointerUp={endDrag}
                      />
                      <circle
                        cx={l.rightX}
                        cy={l.rightBaseY}
                        r={5}
                        fill="#0f766e"
                        stroke="white"
                        strokeWidth={1.2}
                        style={{ cursor: "ns-resize" }}
                        onPointerDown={(e) => beginDrag(e, l.key, "base")}
                        onPointerMove={onDragMove}
                        onPointerUp={endDrag}
                      />
                    </>
                  )}
                </g>
              );
            })}

            {furos.map((f, i) => {
              const x = PAD_LEFT + i * (COL_W + COL_GAP);
              return (
                <g key={f.id}>
                  <rect x={x} y={PAD_TOP} width={COL_W} height={depthMax * PX_PER_M} fill="url(#hatch)" opacity="0.12" />
                  <rect x={x} y={PAD_TOP} width={COL_W} height={depthMax * PX_PER_M} fill="none" stroke="#111827" strokeWidth="1.4" />
                  {f.camadas.map((c, j) => {
                    const y = PAD_TOP + c.topo * PX_PER_M;
                    const h = Math.max(1, (c.base - c.topo) * PX_PER_M);
                    const unidade = unidadeFromMaterial(c.material);
                    const active = selectedUnidade === "__ALL__" || selectedUnidade === unidade;
                    return (
                      <g key={`${f.id}-${j}`}>
                        <rect
                          x={x}
                          y={y}
                          width={COL_W}
                          height={h}
                          fill={c.cor}
                          fillOpacity={active ? 1 : 0.25}
                          stroke={active ? "#1f2937" : "#9ca3af"}
                          strokeWidth={active ? 0.8 : 0.5}
                        />
                      </g>
                    );
                  })}
                  <text x={x + COL_W / 2} y={16} textAnchor="middle" fontSize="12" fontWeight="600" fill="#111827">
                    {f.codigo}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
