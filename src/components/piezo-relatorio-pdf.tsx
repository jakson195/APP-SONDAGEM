"use client";

import type { CSSProperties } from "react";
import { forwardRef, useMemo } from "react";
import { RelatorioFotosPdfSection } from "@/components/relatorio-fotos-pdf-section";
import { SptPdfStaticMap } from "@/components/spt-pdf-static-map";

export type PiezoLeituraPdf = {
  data: string;
  nivel: string;
  obs?: string;
};

export type PiezoCamadaGeologicaPdf = {
  de: string;
  ate: string;
  tipo?: string;
  cor?: string;
  descricao: string;
};

export type PiezoMetaPdf = {
  pocoCodigo?: string;
  cliente?: string;
  obra?: string;
  local?: string;
  ref?: string;
  dataInstalacao?: string;
  /** Início / término da sondagem (boletim) */
  dataInicio?: string;
  dataFim?: string;
  /** Data do relatório / boletim */
  dataRelatorio?: string;
  diametro?: string;
  comprimentoFiltro?: string;
  tipoFiltro?: string;
  profundidadeTotal?: string;
  cotaBoca?: string;
  /** Cota superfície (m) — coluna COTA */
  cotaSuperficie?: string;
  /** Cota boca do cano (m) — se vazio usa cotaBoca */
  cotaBocaCano?: string;
  coordN?: string;
  coordE?: string;
  coordFuso?: string;
  notasInstalacao?: string;
  pagina?: number;
  totalPaginas?: number;
  responsavel?: string;
  crea?: string;
  endereco?: string;
  rodapeContato?: string;
  mapaLatitude?: number | null;
  mapaLongitude?: number | null;
  mapaZoom?: number;
  fotosCampo?: string[];
  /** Nível d'água medido (m) — coluna Na e rodapé */
  nivelAgua?: string;
  equipamento?: string;
  diametroInstalacao?: string;
  tuboRevestimento?: string;
  bentonite?: string;
  preFiltro?: string;
  seloSanitario?: string;
  acabamento?: string;
  camadasGeologicas?: PiezoCamadaGeologicaPdf[];
};

type Props = {
  leituras: PiezoLeituraPdf[];
  meta: PiezoMetaPdf;
};

function parseNumPt(s: string | undefined): number {
  if (s == null || !String(s).trim()) return 0;
  const t = String(s).trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Altura (px) das colunas esquemáticas do boletim — deve ser igual em COTA, Nₐ, perfis, PROF, descrição. */
const BOLETIM_COL_H = 260;

function roundDepth(x: number): number {
  return Math.round(x * 100) / 100;
}

function formatProfPt(x: number): string {
  return x.toFixed(2).replace(".", ",");
}

function pickRulerStep(profMax: number): number {
  if (profMax <= 3) return 0.25;
  if (profMax <= 8) return 0.5;
  if (profMax <= 20) return 1;
  if (profMax <= 50) return 2;
  return 5;
}

function depthIsBoundary(
  depth: number,
  profMax: number,
  camadas: PiezoCamadaGeologicaPdf[],
): boolean {
  const r = roundDepth(depth);
  if (r === 0 || r === roundDepth(profMax)) return true;
  for (const c of camadas) {
    if (roundDepth(parseNumPt(c.de)) === r || roundDepth(parseNumPt(c.ate)) === r)
      return true;
  }
  return false;
}

/** Traços da régua: limites das camadas + grelha a meio-passo. */
function buildRulerTicks(
  profMax: number,
  camadas: PiezoCamadaGeologicaPdf[],
): { depth: number; major: boolean }[] {
  if (profMax < 1e-9) return [{ depth: 0, major: true }];
  const step = pickRulerStep(profMax);
  const set = new Set<number>();
  const add = (x: number) => {
    const v = roundDepth(Math.min(Math.max(0, x), profMax));
    set.add(v);
  };
  add(0);
  add(profMax);
  for (const c of camadas) {
    add(parseNumPt(c.de));
    add(parseNumPt(c.ate));
  }
  const half = step / 2;
  for (let x = 0; x <= profMax + 1e-9; x += half) add(x);
  const arr = [...set]
    .filter((x) => x >= 0 && x <= profMax + 1e-9)
    .sort((a, b) => a - b);
  return arr.map((depth) => {
    const onFullGrid =
      Math.abs(depth / step - Math.round(depth / step)) < 1e-5;
    const major =
      depthIsBoundary(depth, profMax, camadas) ||
      onFullGrid ||
      depth <= 1e-9 ||
      Math.abs(depth - profMax) < 1e-5;
    return { depth, major };
  });
}

type GeolDepthSeg = {
  z0: number;
  z1: number;
  camada: PiezoCamadaGeologicaPdf | null;
};

/** Faixas de 0…profMax alinhadas às profundidades reais (De/Até), com vãos neutros. */
function buildGeolDepthSegments(
  camadas: PiezoCamadaGeologicaPdf[],
  profMax: number,
): GeolDepthSeg[] {
  if (profMax < 1e-9) {
    return [{ z0: 0, z1: 0.01, camada: null }];
  }
  if (!camadas.length) {
    return [{ z0: 0, z1: profMax, camada: null }];
  }
  const sorted = [...camadas]
    .map((c) => ({
      c,
      d0: parseNumPt(c.de),
      d1: parseNumPt(c.ate),
    }))
    .filter((x) => x.d1 > x.d0)
    .sort((a, b) => a.d0 - b.d0);
  const out: GeolDepthSeg[] = [];
  let cursor = 0;
  for (const { c, d0, d1 } of sorted) {
    const top = Math.max(d0, 0);
    const bot = Math.min(d1, profMax);
    if (bot <= top + 1e-9) continue;
    if (top > cursor + 1e-9) {
      out.push({ z0: cursor, z1: top, camada: null });
    }
    const start = Math.max(top, cursor);
    if (bot > start + 1e-9) {
      out.push({ z0: start, z1: bot, camada: c });
    }
    cursor = Math.max(cursor, bot);
  }
  if (profMax - cursor > 1e-9) {
    out.push({ z0: cursor, z1: profMax, camada: null });
  }
  return out;
}

function descricaoGeolBloco(c: PiezoCamadaGeologicaPdf): string {
  const tipo = c.tipo?.trim() ?? "";
  const desc = c.descricao?.trim() ?? "";
  if (tipo && desc) return `${tipo}, ${desc}`;
  if (tipo) return tipo;
  if (desc) return desc;
  return "—";
}

function RulerCotaColumn({
  profMax,
  cSupN,
  ticks,
}: {
  profMax: number;
  cSupN: number;
  ticks: { depth: number; major: boolean }[];
}) {
  const h = BOLETIM_COL_H;
  return (
    <div
      style={{
        position: "relative",
        height: h,
        borderRight: "1px solid #000",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: 1,
          top: 0,
          bottom: 0,
          width: 1,
          background: "#000",
        }}
      />
      {ticks.map((t, idx) => {
        const pct = profMax > 0 ? (t.depth / profMax) * 100 : 0;
        const tickW = t.major ? 12 : 5;
        const cotaStr =
          cSupN > 0 && t.major
            ? (cSupN - t.depth).toFixed(3).replace(".", ",")
            : null;
        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${pct}%`,
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 2,
              }}
            >
              {cotaStr ? (
                <span
                  style={{
                    fontSize: "5.5px",
                    fontWeight: 700,
                    marginRight: 3,
                    color: "#000",
                  }}
                >
                  {cotaStr}
                </span>
              ) : (
                <span style={{ width: 0 }} />
              )}
              <div
                style={{
                  width: tickW,
                  height: 1,
                  background: "#000",
                  flexShrink: 0,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RulerProfColumn({
  profMax,
  ticks,
}: {
  profMax: number;
  ticks: { depth: number; major: boolean }[];
}) {
  const h = BOLETIM_COL_H;
  const step = pickRulerStep(profMax);
  const bandH = Math.max(step / 6, profMax / 80, 0.08);
  const bands: number[] = [];
  for (let d = 0; d < profMax - 1e-9; ) {
    const next = Math.min(d + bandH, profMax);
    bands.push(((next - d) / profMax) * 100);
    d = next;
  }
  if (bands.length === 0) bands.push(100);
  const barW = 9;
  return (
    <div
      style={{
        display: "flex",
        height: h,
        boxSizing: "border-box",
        borderLeft: "1px solid #000",
      }}
    >
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        {ticks.map((t, idx) => {
          const pct = profMax > 0 ? (t.depth / profMax) * 100 : 0;
          const tickW = t.major ? 10 : 5;
          return (
            <div
              key={idx}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: `${pct}%`,
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 1,
              }}
            >
              {t.major ? (
                <span
                  style={{
                    fontSize: "5.5px",
                    fontWeight: 700,
                    marginRight: 2,
                    color: "#000",
                  }}
                >
                  {formatProfPt(t.depth)}
                </span>
              ) : null}
              <div
                style={{
                  width: tickW,
                  height: 1,
                  background: "#000",
                  flexShrink: 0,
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          width: barW,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid #000",
          boxSizing: "border-box",
        }}
      >
        {bands.map((pct, i) => (
          <div
            key={i}
            style={{
              height: `${pct}%`,
              background: i % 2 === 0 ? "#ffffff" : "#b0b0b0",
              boxSizing: "border-box",
              borderBottom: "1px solid #6b7280",
            }}
          />
        ))}
      </div>
    </div>
  );
}

type WellLayerKind =
  | "selo"
  | "bentonita"
  | "tuboLiso"
  | "tuboRanhurado"
  | "preFiltro";

type WellLayerRow = { kind: WellLayerKind; h: number };

function layerStyle(kind: WellLayerKind): {
  bg: string;
  extra?: CSSProperties;
} {
  switch (kind) {
    case "selo":
      return { bg: "#8f9399" };
    case "bentonita":
      return { bg: "#5c2a2a" };
    case "tuboLiso":
      return {
        bg: "#a8d4f0",
        extra: {
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent 0, transparent 3px, rgba(30, 64, 120, 0.35) 3px, rgba(30, 64, 120, 0.35) 4px)",
        },
      };
    case "tuboRanhurado":
      return {
        bg: "#1e4db8",
        extra: {
          backgroundImage:
            "repeating-linear-gradient(180deg, #0f172a 0, #0f172a 1.5px, transparent 1.5px, transparent 5px)",
        },
      };
    case "preFiltro":
      return {
        bg: "#fde68a",
        extra: {
          backgroundImage: "radial-gradient(circle, #a16207 1px, transparent 1px)",
          backgroundSize: "5px 5px",
        },
      };
    default:
      return { bg: "#e5e7eb" };
  }
}

const PERFIL_POCO_CAP_PX = 8;
const PERFIL_POCO_PIPE_FR = 0.34;

function pickLayerH(layers: WellLayerRow[], kind: WellLayerKind): number {
  return layers.find((l) => l.kind === kind)?.h ?? 0;
}

/** Coluna única: anular (fundo) + tubo centralizado — estilo boletim clássico. */
function PerfilPocoComposite({
  anularLayers,
  tuboLayers,
}: {
  anularLayers: WellLayerRow[];
  tuboLayers: WellLayerRow[];
}) {
  const hSelo = pickLayerH(anularLayers, "selo");
  const hBen = pickLayerH(anularLayers, "bentonita");
  const hPre = pickLayerH(anularLayers, "preFiltro");
  const hLiso = pickLayerH(tuboLayers, "tuboLiso");
  const hRan = pickLayerH(tuboLayers, "tuboRanhurado");

  const depthAnn = hSelo + hBen + hPre;
  const depthPipe = hLiso + hRan;
  const depthDraw = Math.max(depthAnn, depthPipe, 1e-6);

  if (depthDraw < 1e-6) {
    return (
      <div
        style={{
          height: `${BOLETIM_COL_H}px`,
          background: "#f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "5px",
          color: "#6b7280",
          border: "1px solid #000",
          boxSizing: "border-box",
        }}
      >
        —
      </div>
    );
  }

  const hRem = Math.max(0, depthDraw - depthAnn);
  const annularFlex: { kind: WellLayerKind | "vazio"; h: number }[] = [
    { kind: "selo", h: hSelo },
    { kind: "bentonita", h: hBen },
    { kind: "preFiltro", h: hPre },
  ];
  if (hRem > 1e-6) annularFlex.push({ kind: "vazio", h: hRem });

  const pipeFrac = depthPipe / depthDraw;
  const pipeDepth = hLiso + hRan;

  return (
    <div
      style={{
        position: "relative",
          height: `${BOLETIM_COL_H}px`,
          width: "100%",
          border: "1px solid #000",
          boxSizing: "border-box",
          background: "#f8fafc",
        }}
      >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: `${PERFIL_POCO_PIPE_FR * 100 + 4}%`,
          maxWidth: "42%",
          height: PERFIL_POCO_CAP_PX,
          background: "#facc15",
          border: "1px solid #ca8a04",
          borderBottom: "none",
          borderRadius: "1px 1px 0 0",
          zIndex: 6,
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: PERFIL_POCO_CAP_PX,
          bottom: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            zIndex: 0,
          }}
        >
          {annularFlex.map((row, idx) => {
            if (row.h < 1e-9) return null;
            const isLast = idx === annularFlex.length - 1;
            if (row.kind === "vazio") {
              return (
                <div
                  key="vazio"
                  style={{
                    flex: row.h,
                    minHeight: 2,
                    background: "#e8eaed",
                    borderBottom: isLast ? "none" : "1px solid #374151",
                    boxSizing: "border-box",
                  }}
                />
              );
            }
            const st = layerStyle(row.kind);
            const dark = row.kind === "bentonita";
            const label = `${row.h.toFixed(2).replace(".", ",")}`;
            return (
              <div
                key={row.kind}
                style={{
                  flex: row.h,
                  minHeight: 4,
                  borderBottom: "1px solid #292524",
                  boxSizing: "border-box",
                  backgroundColor: st.bg,
                  position: "relative",
                  ...st.extra,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: 2,
                    top: 2,
                    fontSize: "4.5px",
                    lineHeight: 1,
                    color: dark ? "#fecaca" : "#111827",
                    fontWeight: 600,
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        {pipeDepth > 1e-6 ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 0,
              width: `${PERFIL_POCO_PIPE_FR * 100}%`,
              maxWidth: "38%",
              height: `${pipeFrac * 100}%`,
              zIndex: 4,
              borderLeft: "1px solid #1e293b",
              borderRight: "1px solid #1e293b",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 5,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {hLiso > 1e-6 ? (
                <div
                  style={{
                    flex: hLiso,
                    minHeight: 4,
                    borderBottom: "1px solid #0f172a",
                    boxSizing: "border-box",
                    ...layerStyle("tuboLiso").extra,
                    backgroundColor: layerStyle("tuboLiso").bg,
                  }}
                />
              ) : null}
              {hRan > 1e-6 ? (
                <div
                  style={{
                    flex: hRan,
                    minHeight: 4,
                    borderBottom: "1px solid #0f172a",
                    boxSizing: "border-box",
                    ...layerStyle("tuboRanhurado").extra,
                    backgroundColor: layerStyle("tuboRanhurado").bg,
                  }}
                />
              ) : null}
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: 5,
                background: "#ffffff",
                borderTop: "1px solid #000",
                boxSizing: "border-box",
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

const cell: CSSProperties = {
  border: "1px solid #000000",
  padding: "3px 4px",
  fontSize: "7px",
  color: "#000000",
  verticalAlign: "top" as const,
};

const hdr: CSSProperties = {
  ...cell,
  fontWeight: 700,
  textAlign: "center" as const,
  backgroundColor: "#e5e7eb",
};

const geolPatterns = [
  "repeating-linear-gradient(135deg, #6b7280 0, #6b7280 1px, #d1d5db 1px, #d1d5db 4px)",
  "repeating-linear-gradient(90deg, #9ca3af 0, #9ca3af 2px, #e5e7eb 2px, #e5e7eb 5px)",
  "repeating-linear-gradient(45deg, #78716c 0, #78716c 1px, #d6d3d1 1px, #d6d3d1 3px)",
  "#9ca3af",
  "#d1d5db",
];

export const PiezoRelatorioPdf = forwardRef<HTMLDivElement, Props>(
  function PiezoRelatorioPdf({ leituras, meta }, ref) {
    const m = useMemo(() => {
      const cBocaCano =
        meta.cotaBocaCano?.trim() || meta.cotaBoca?.trim() || "—";
      const cSup = meta.cotaSuperficie?.trim() || "—";
      const profT = parseNumPt(meta.profundidadeTotal);
      const profMax = Math.max(profT, 0.01);
      const cSupN = parseNumPt(meta.cotaSuperficie);
      const camadas = Array.isArray(meta.camadasGeologicas)
        ? meta.camadasGeologicas
        : [];
      let maxD = profMax;
      for (const c of camadas) {
        maxD = Math.max(maxD, parseNumPt(c.ate), parseNumPt(c.de));
      }
      const depthScale = Math.max(profMax, maxD, 0.01);

      let hSelo = parseNumPt(meta.seloSanitario);
      let hBen = parseNumPt(meta.bentonite);
      let hRev = parseNumPt(meta.tuboRevestimento);
      let hFilt = parseNumPt(meta.comprimentoFiltro);
      let hPre = parseNumPt(meta.preFiltro);

      if (hSelo + hBen + hRev + hFilt + hPre < 0.001) {
        hSelo = 0.15 * depthScale;
        hBen = 0.25 * depthScale;
        hRev = 0.35 * depthScale;
        hFilt = 0.15 * depthScale;
        hPre = 0.1 * depthScale;
      }

      const totalWell = hSelo + hBen + hRev + hFilt + hPre;
      const capScale =
        totalWell > depthScale + 1e-6 ? depthScale / totalWell : 1;
      hSelo *= capScale;
      hBen *= capScale;
      hRev *= capScale;
      hFilt *= capScale;
      hPre *= capScale;

      const anularLayers: WellLayerRow[] = [
        { kind: "selo", h: hSelo },
        { kind: "bentonita", h: hBen },
        { kind: "preFiltro", h: hPre },
      ];
      const tuboLayers: WellLayerRow[] = [
        { kind: "tuboLiso", h: hRev },
        { kind: "tuboRanhurado", h: hFilt },
      ];

      const nivel = parseNumPt(meta.nivelAgua);
      const nivelPct =
        nivel > 0 && depthScale > 0
          ? Math.min(100, (nivel / depthScale) * 100)
          : null;

      return {
        cod: meta.pocoCodigo?.trim() || "—",
        cliente: meta.cliente?.trim() || "—",
        obra: meta.obra?.trim() || "—",
        local: meta.local?.trim() || "—",
        ref: meta.ref?.trim() || "—",
        dInst: meta.dataInstalacao?.trim() || "—",
        dIni: meta.dataInicio?.trim() || meta.dataInstalacao?.trim() || "—",
        dFim: meta.dataFim?.trim() || "—",
        dRel: meta.dataRelatorio?.trim() || "—",
        diam: meta.diametro?.trim() || "—",
        cFilt: meta.comprimentoFiltro?.trim() || "—",
        tFilt: meta.tipoFiltro?.trim() || "—",
        profT: meta.profundidadeTotal?.trim() || "—",
        cota: meta.cotaBoca?.trim() || "—",
        cSup,
        cBocaCano,
        cn: meta.coordN?.trim() || "—",
        ce: meta.coordE?.trim() || "—",
        fuso: meta.coordFuso?.trim() || "22 S",
        notas: meta.notasInstalacao?.trim() || "",
        pg: meta.pagina ?? 1,
        tg: meta.totalPaginas ?? 1,
        resp: meta.responsavel?.trim() || "—",
        crea: meta.crea?.trim() || "—",
        end:
          meta.endereco?.trim() || "Rua Flávio Pires, 131, Araranguá - SC",
        contato:
          meta.rodapeContato?.trim() ||
          "www.soilsul.com.br",
        equip: meta.equipamento?.trim() || "TRADO MECANIZADO",
        diamInst: meta.diametroInstalacao?.trim() || "—",
        nAgua: meta.nivelAgua?.trim() || "—",
        bent: meta.bentonite?.trim() || "—",
        preF: meta.preFiltro?.trim() || "—",
        selo: meta.seloSanitario?.trim() || "—",
        tuboRev: meta.tuboRevestimento?.trim() || "—",
        acab: meta.acabamento?.trim() || "0",
        depthScale,
        cSupN,
        camadas,
        anularLayers,
        tuboLayers,
        nivelPct,
        profMax: depthScale,
      };
    }, [meta]);

    const colSchematic: CSSProperties = {
      position: "relative",
      width: "100%",
      height: `${BOLETIM_COL_H}px`,
      border: "1px solid #000",
      background: "#ffffff",
      boxSizing: "border-box",
    };

    const rulerTicks = useMemo(
      () => buildRulerTicks(m.profMax, m.camadas),
      [m.profMax, m.camadas],
    );

    const geolSegments = useMemo(
      () => buildGeolDepthSegments(m.camadas, m.profMax),
      [m.camadas, m.profMax],
    );

    return (
      <div
        ref={ref}
        style={{
          width: "794px",
          minWidth: "794px",
          maxWidth: "794px",
          backgroundColor: "#ffffff",
          padding: "10px 12px 14px",
          color: "#000000",
          fontSize: "8px",
          lineHeight: 1.2,
          fontFamily: "Arial, Helvetica, sans-serif",
          boxSizing: "border-box",
          overflow: "visible",
        }}
      >
        <div
          style={{
            border: "2px solid #000000",
            padding: "6px 8px",
            marginBottom: "6px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "stretch",
              gap: "8px",
              borderBottom: "1px solid #000",
              paddingBottom: "6px",
              marginBottom: "6px",
            }}
          >
            <div style={{ flex: "0 0 auto", fontWeight: 800, fontSize: "13px" }}>
              SOILS
              <span style={{ fontWeight: 400 }}>UL</span>
              <div style={{ fontSize: "6px", fontWeight: 400, marginTop: "2px" }}>
                SONDAGENS E GEOTECNIA
              </div>
            </div>
            <div style={{ flex: "1", textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: "10px", letterSpacing: "0.02em" }}>
                BOLETIM DE SONDAGEM
              </div>
              <div style={{ fontWeight: 700, fontSize: "9px", marginTop: "2px" }}>
                POÇO DE MONITORAMENTO
              </div>
            </div>
            <div
              style={{
                flex: "0 0 100px",
                border: "2px solid #000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "14px",
                textAlign: "center",
              }}
            >
              {m.cod}
            </div>
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "7px",
              marginBottom: "6px",
            }}
          >
            <tbody>
              <tr>
                <td style={{ ...cell, width: "12%", fontWeight: 700 }}>Cliente</td>
                <td style={{ ...cell, width: "38%" }} colSpan={2}>
                  {m.cliente}
                </td>
                <td style={{ ...cell, width: "12%", fontWeight: 700 }}>Início</td>
                <td style={{ ...cell, width: "12%" }}>{m.dIni}</td>
                <td style={{ ...cell, width: "12%", fontWeight: 700 }}>Cota sup. (m)</td>
                <td style={{ ...cell, width: "12%" }}>{m.cSup}</td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Obra</td>
                <td style={{ ...cell }} colSpan={2}>
                  {m.obra}
                </td>
                <td style={{ ...cell, fontWeight: 700 }}>Término</td>
                <td style={{ ...cell }}>{m.dFim}</td>
                <td style={{ ...cell, fontWeight: 700 }}>Cota boca cano (m)</td>
                <td style={{ ...cell }}>{m.cBocaCano}</td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Local</td>
                <td style={{ ...cell }} colSpan={2}>
                  {m.local}
                </td>
                <td style={{ ...cell, fontWeight: 700 }}>Data</td>
                <td style={{ ...cell }}>{m.dRel}</td>
                <td style={{ ...cell, fontWeight: 700 }}>Folha</td>
                <td style={{ ...cell }}>
                  {String(m.pg).padStart(2, "0")}/{String(m.tg).padStart(2, "0")}
                </td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Ref.</td>
                <td style={{ ...cell }} colSpan={2}>
                  {m.ref}
                </td>
                <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>
                  Responsável Téc. / CREA
                </td>
                <td style={{ ...cell }} colSpan={2}>
                  {m.resp}
                  {m.crea !== "—" ? ` — CREA ${m.crea}` : ""}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Bloco principal: cotas + perfis */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              fontSize: "6.5px",
            }}
          >
            <thead>
              <tr>
                <th style={{ ...hdr, width: "9%" }}>COTA (m)</th>
                <th style={{ ...hdr, width: "8%" }}>N<sub>a</sub> (m)</th>
                <th style={{ ...hdr, width: "16%" }}>PERFIL POÇO</th>
                <th style={{ ...hdr, width: "14%" }}>
                  PERFIL GEOLÓGICO — litologia
                </th>
                <th style={{ ...hdr, width: "8%" }}>VOC (ppm)</th>
                <th style={{ ...hdr, width: "8%" }}>FASE LIVRE</th>
                <th style={{ ...hdr, width: "9%" }}>PROF. (m)</th>
                <th style={{ ...hdr, width: "28%" }}>
                  DESCRIÇÃO GEOLÓGICA DO MATERIAL
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...cell, padding: 0, verticalAlign: "stretch" }}>
                  <RulerCotaColumn
                    profMax={m.profMax}
                    cSupN={m.cSupN}
                    ticks={rulerTicks}
                  />
                </td>
                <td style={{ ...cell, padding: 0, position: "relative" }}>
                  <div style={colSchematic}>
                    {m.nivelPct != null && (
                      <div
                        title="Nível d'água"
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          top: `${m.nivelPct}%`,
                          height: "2px",
                          background: "#2563eb",
                          zIndex: 4,
                          boxShadow: "0 0 0 1px #fff",
                        }}
                      />
                    )}
                    <div
                      style={{
                        position: "absolute",
                        bottom: "2px",
                        left: 0,
                        right: 0,
                        fontSize: "6px",
                        textAlign: "center",
                      }}
                    >
                      ▼
                    </div>
                  </div>
                </td>
                <td style={{ ...cell, padding: 0 }}>
                  <PerfilPocoComposite
                    anularLayers={m.anularLayers}
                    tuboLayers={m.tuboLayers}
                  />
                </td>
                <td style={{ ...cell, padding: 0 }}>
                  <div
                    style={{
                      ...colSchematic,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    {(() => {
                      let layerOrd = 0;
                      return geolSegments.map((seg, si) => {
                        const hPct =
                          m.profMax > 0
                            ? ((seg.z1 - seg.z0) / m.profMax) * 100
                            : 0;
                        const topPct =
                          m.profMax > 0 ? (seg.z0 / m.profMax) * 100 : 0;
                        if (hPct < 1e-6) return null;
                        if (!seg.camada) {
                          return (
                            <div
                              key={`geol-gap-${seg.z0}-${seg.z1}-${si}`}
                              style={{
                                position: "absolute",
                                left: 0,
                                right: 0,
                                top: `${topPct}%`,
                                height: `${hPct}%`,
                                background: "#e8eaed",
                                borderBottom: "1px solid #000",
                                boxSizing: "border-box",
                              }}
                            />
                          );
                        }
                        const pi = layerOrd++;
                        const col = seg.camada.cor?.trim();
                        const isHex =
                          col != null && /^#[0-9a-f]{3,8}$/i.test(col);
                        return (
                          <div
                            key={`geol-${seg.z0}-${seg.z1}-${si}`}
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: `${topPct}%`,
                              height: `${hPct}%`,
                              ...(isHex
                                ? { backgroundColor: col }
                                : {
                                    background:
                                      geolPatterns[
                                        pi % geolPatterns.length
                                      ],
                                  }),
                              borderBottom: "1px solid #000",
                              boxSizing: "border-box",
                            }}
                          />
                        );
                      });
                    })()}
                  </div>
                </td>
                <td style={{ ...cell, minHeight: `${BOLETIM_COL_H}px` }} />
                <td style={{ ...cell, minHeight: `${BOLETIM_COL_H}px` }} />
                <td style={{ ...cell, padding: 0 }}>
                  <RulerProfColumn profMax={m.profMax} ticks={rulerTicks} />
                </td>
                <td style={{ ...cell, padding: 0, verticalAlign: "top" }}>
                  <div
                    style={{
                      position: "relative",
                      height: `${BOLETIM_COL_H}px`,
                      border: "1px solid #000",
                      borderTop: "none",
                      borderBottom: "none",
                      boxSizing: "border-box",
                      background: "#fff",
                    }}
                  >
                    {m.camadas.length === 0 ? (
                      <div
                        style={{
                          padding: "8px",
                          fontSize: "6.5px",
                          color: "#6b7280",
                          lineHeight: 1.35,
                        }}
                      >
                        Indique as camadas geológicas no formulário (De, Até,
                        descrição).
                      </div>
                    ) : (
                      geolSegments.map((seg, si) => {
                        const hPct =
                          m.profMax > 0
                            ? ((seg.z1 - seg.z0) / m.profMax) * 100
                            : 0;
                        const topPct =
                          m.profMax > 0 ? (seg.z0 / m.profMax) * 100 : 0;
                        if (hPct < 1e-6) return null;
                        const text = seg.camada
                          ? descricaoGeolBloco(seg.camada).toUpperCase()
                          : "";
                        return (
                          <div
                            key={`desc-${seg.z0}-${seg.z1}-${si}`}
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: `${topPct}%`,
                              height: `${hPct}%`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              textAlign: "center",
                              padding: "3px 5px",
                              fontSize: "6.5px",
                              lineHeight: 1.25,
                              fontWeight: 500,
                              color: "#000",
                              borderBottom: "1px solid #000",
                              boxSizing: "border-box",
                              overflow: "hidden",
                            }}
                          >
                            {text}
                          </div>
                        );
                      })
                    )}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Rodapé técnico — grelha tipo boletim */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "6.5px",
              marginTop: "6px",
            }}
          >
            <tbody>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Equipamento</td>
                <td style={cell} colSpan={2}>
                  {m.equip}
                </td>
                <td style={{ ...cell, fontWeight: 700 }}>Prof. do furo (m)</td>
                <td style={cell}>{m.profT}</td>
                <td style={{ ...cell, fontWeight: 700 }}>Diâm. furo</td>
                <td style={cell} colSpan={2}>
                  {m.diam}
                </td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>
                  Coord. UTM (SIRGAS2000, fuso {m.fuso})
                </td>
                <td style={cell} colSpan={4}>
                  X: {m.ce} &nbsp;|&nbsp; Y: {m.cn}
                </td>
                <td style={{ ...cell, fontWeight: 700 }}>Prof. do poço (m)</td>
                <td style={cell}>{m.profT}</td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Nível d&apos;água (m)</td>
                <td style={cell}>{m.nAgua}</td>
                <td style={{ ...cell, fontWeight: 700 }}>Diâm. inst.</td>
                <td style={cell}>{m.diamInst}</td>
                <td style={{ ...cell, fontWeight: 700 }}>
                  Tubo liso — revest. (m)
                </td>
                <td style={cell}>{m.tuboRev}</td>
                <td style={{ ...cell, fontWeight: 700 }}>
                  Tubo ranhurado — filtro (m)
                </td>
                <td style={cell}>{m.cFilt}</td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Bentonita (m)</td>
                <td style={cell}>{m.bent}</td>
                <td style={{ ...cell, fontWeight: 700 }}>Pré-filtro (m)</td>
                <td style={cell}>{m.preF}</td>
                <td style={{ ...cell, fontWeight: 700 }}>Selo sanitário (m)</td>
                <td style={cell}>{m.selo}</td>
                <td style={{ ...cell, fontWeight: 700 }}>Acabamento</td>
                <td style={cell}>{m.acab}</td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Tipo filtro / tela</td>
                <td style={{ ...cell }} colSpan={7}>
                  {m.tFilt}
                </td>
              </tr>
              {m.notas ? (
                <tr>
                  <td style={{ ...cell, fontWeight: 700 }}>Notas</td>
                  <td style={{ ...cell }} colSpan={7}>
                    {m.notas}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {/* Legenda simplificada */}
          <div
            style={{
              marginTop: "6px",
              border: "1px solid #000",
              padding: "4px 6px",
              fontSize: "6.5px",
            }}
          >
            <strong>Legenda:</strong> <strong>Perfil poço</strong> — coluna
            única: fundo = material anular (cinza selo; castanho avermelhado
            bentonita; amarelo pontilhado pré-filtro); ao centro, tubo azul
            claro com traços verticais (liso) e azul escuro com traços
            horizontais (ranhurado); tampa amarela no topo; sapata branca na base
            do tubo. Dados de instalação, independentes do perfil geológico.
            Metros nas faixas e na grelha. Linha azul em N<sub>a</sub> — nível
            d&apos;água.
          </div>
        </div>

        {meta.mapaLatitude != null &&
          meta.mapaLongitude != null &&
          Number.isFinite(meta.mapaLatitude) &&
          Number.isFinite(meta.mapaLongitude) && (
            <div data-spt-pdf-has-map style={{ marginTop: "6px" }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "7px",
                  marginBottom: "6px",
                  color: "#000000",
                  textAlign: "center",
                }}
              >
                Mapa de localização (WGS84) — referência no terreno
              </div>
              <SptPdfStaticMap
                key={`${meta.mapaLatitude}-${meta.mapaLongitude}-${meta.mapaZoom ?? 16}`}
                lat={meta.mapaLatitude}
                lng={meta.mapaLongitude}
                zoom={meta.mapaZoom ?? 16}
              />
            </div>
          )}

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid #000000",
            tableLayout: "fixed",
            marginTop: "8px",
          }}
        >
          <thead>
            <tr>
              <th style={{ ...hdr, width: "22%" }}>Data</th>
              <th style={{ ...hdr, width: "18%" }}>Nível (m)</th>
              <th style={{ ...hdr, width: "60%" }}>Observações</th>
            </tr>
          </thead>
          <tbody>
            {leituras.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ ...cell, textAlign: "center" }}>
                  Sem leituras registadas — preencha a grelha na aplicação.
                </td>
              </tr>
            ) : (
              leituras.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...cell, textAlign: "center" }}>
                    {r.data.trim() || "—"}
                  </td>
                  <td style={{ ...cell, textAlign: "center" }}>
                    {r.nivel.trim() || "—"}
                  </td>
                  <td style={cell}>{r.obs?.trim() || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {meta.fotosCampo && meta.fotosCampo.length > 0 && (
          <RelatorioFotosPdfSection
            fotos={meta.fotosCampo}
            border="2px solid #000000"
          />
        )}

        <div
          style={{
            marginTop: "10px",
            fontSize: "7px",
            borderTop: "1px solid #000",
            paddingTop: "6px",
            lineHeight: 1.35,
          }}
        >
          <div style={{ marginBottom: "4px" }}>{m.end}</div>
          <div style={{ marginBottom: "4px" }}>{m.contato}</div>
          <div style={{ textAlign: "right" }}>
            <strong>Responsável técnico:</strong> {m.resp}
            {m.crea !== "—" ? ` — CREA ${m.crea}` : ""}
          </div>
        </div>
      </div>
    );
  },
);

PiezoRelatorioPdf.displayName = "PiezoRelatorioPdf";
