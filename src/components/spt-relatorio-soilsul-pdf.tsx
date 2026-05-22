"use client";

import type { CSSProperties, ReactNode } from "react";
import { forwardRef, useMemo } from "react";
import { BRAND } from "@/lib/brand";
import { RelatorioFotosPdfSection } from "@/components/relatorio-fotos-pdf-section";
import { SptPdfStaticMap } from "@/components/spt-pdf-static-map";
import {
  avancoPadraoParaProfSpt,
  formatarProfSptPt,
  golpesParaSomas30cmNaLinha,
  golpesSptNum,
  numeroAmostraSpt,
  rowSpanCamadaSpt,
  rowSpanGrupoAmostraSpt,
  round2ProfSpt,
  somasGolpes30cm,
  somasGolpes30cmNaLinha,
  temGolpesParaColuna30cm,
} from "@/lib/spt-profundidade-tabela";
import { corSoloSpt } from "@/lib/spt-solo-cor";

export type SptLinhaPdf = {
  prof: number;
  g1: number;
  g2: number;
  g3: number;
  /** Penetração em cm no intervalo (ex.: 2 golpes em 17 cm). */
  cm1?: number;
  cm2?: number;
  cm3?: number;
  solo: string;
  soloDetalhe: string;
  obs: string;
  avanco?: string;
  reves?: string;
  consistencia?: string;
  /** Cor do material (hex); se omitido, deriva do nome em `solo`. */
  cor?: string;
};

export type SptMetaPdf = {
  furoCodigo?: string;
  cliente?: string;
  obra?: string;
  local?: string;
  dataInicio?: string;
  dataFim?: string;
  pagina?: number;
  totalPaginas?: number;
  amostradorExt?: string;
  amostradorInt?: string;
  /** Ø do revestimento (mm). */
  revestimento?: string;
  /** Comprimento do revestimento (m) — linha técnica do boletim. */
  revestimentoComprimento?: string;
  trado?: string;
  alturaQueda?: string;
  pesoMartelo?: string;
  sistema?: string;
  cota?: string;
  nivelAgua?: string;
  naProfundidade?: string;
  coordN?: string;
  coordE?: string;
  fuso?: string;
  endereco?: string;
  sondador?: string;
  responsavel?: string;
  crea?: string;
  rodapeContato?: string;
  /** Ponto WGS84 para mapa estático no PDF (furo ou obra). */
  mapaLatitude?: number | null;
  mapaLongitude?: number | null;
  mapaZoom?: number;
  /** Fotos de campo (data URL JPEG) para o PDF. */
  fotosCampo?: string[];
};

type Props = {
  linhas: SptLinhaPdf[];
  meta: SptMetaPdf;
};

const ROW_H = 32;
/** Linhas finas no PDF (html2canvas com scale 2 evita grelha grossa). */
const PDF_BORDER = "0.5px solid #000000";
const PDF_BORDER_DIVIDER = "0.5px solid #9ca3af";

/** Célula 15 cm: golpes (cima) + penetração cm (baixo), como no boletim de campo. */
function cmPenetracaoPdf(avanco: string, cm: number): number {
  const c = golpesSptNum(cm);
  if (c <= 0) return 0;
  if (avanco === "BT") return c;
  return c !== 15 ? c : 0;
}

function CelulaGolpePenetracao15({
  golpes,
  cm,
  heightPx = ROW_H,
}: {
  golpes: number;
  cm: number;
  heightPx?: number;
}) {
  const metade = Math.floor(heightPx / 2);
  return (
    <td
      style={{
        border: PDF_BORDER,
        padding: 0,
        verticalAlign: "middle",
        textAlign: "center",
        height: heightPx,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: heightPx,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            minHeight: metade,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "8px",
            borderBottom: PDF_BORDER_DIVIDER,
            lineHeight: 1,
          }}
        >
          {golpes > 0 ? golpes : "\u00a0"}
        </div>
        <div
          style={{
            flex: "1 1 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "7px",
            color: "#374151",
            lineHeight: 1,
          }}
        >
          {cm > 0 ? cm : "\u00a0"}
        </div>
      </div>
    </td>
  );
}

const RODAPE_CONTATO_PADRAO = BRAND.footerContact;

function parseProfMeta(s: string | undefined): number | null {
  if (s == null || !String(s).trim()) return null;
  const t = String(s).trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function LogoDataGeo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <svg width={28} height={28} viewBox="0 0 32 32" aria-hidden>
        <polygon points="16,2 30,28 2,28" fill="#1e3a5f" />
        <polygon points="16,8 24,26 8,26" fill="#ffffff" opacity={0.15} />
      </svg>
      <div style={{ fontWeight: 800, fontSize: "12px", letterSpacing: "-0.3px" }}>
        {BRAND.nameShort}
        <span style={{ fontWeight: 400 }}> Digital</span>
      </div>
    </div>
  );
}

/** Altura do bloco de cabeçalhos verticais. */
const HDR_VERTICAL_H = 88;

/** Célula de cabeçalho com rótulo vertical centrado na coluna. */
function hdrVertical(base: CSSProperties): CSSProperties {
  return {
    ...base,
    height: HDR_VERTICAL_H,
    minHeight: HDR_VERTICAL_H,
    padding: "3px 2px",
    verticalAlign: "middle",
    textAlign: "center",
    boxSizing: "border-box",
    overflow: "visible",
  };
}

/**
 * Texto vertical (caracteres em pé), lido de baixo para cima — cabe na largura da coluna.
 */
function VerticalHdrCell({
  children,
  thStyle,
}: {
  children: ReactNode;
  thStyle: CSSProperties;
}) {
  return (
    <th style={thStyle} rowSpan={2}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: HDR_VERTICAL_H - 6,
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            display: "block",
            writingMode: "vertical-rl",
            textOrientation: "upright",
            whiteSpace: "nowrap",
            fontSize: "5.5px",
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: "0.01em",
            textAlign: "center",
            margin: "0 auto",
          }}
        >
          {children}
        </span>
      </div>
    </th>
  );
}

const consistenciaHdrLabel: CSSProperties = {
  display: "block",
  writingMode: "vertical-rl",
  textOrientation: "upright",
  whiteSpace: "nowrap",
  fontSize: "5.5px",
  fontWeight: 700,
  lineHeight: 1.08,
  textAlign: "center",
  margin: "0 auto",
};

/** Cabeçalho Consistência/Compacidade em duas linhas verticais + separador. */
function ConsistenciaHdrCell({ thStyle }: { thStyle: CSSProperties }) {
  return (
    <th style={thStyle} rowSpan={2}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: HDR_VERTICAL_H - 6,
          gap: 3,
          boxSizing: "border-box",
        }}
      >
        <span style={consistenciaHdrLabel}>Consistência</span>
        <span
          style={{
            fontSize: "5px",
            fontWeight: 700,
            lineHeight: 1,
            color: "#000000",
          }}
          aria-hidden
        >
          /
        </span>
        <span style={consistenciaHdrLabel}>Compacidade</span>
      </div>
    </th>
  );
}

/** Quebra texto de consistência onde fica mais legível na coluna estreita. */
function linhasConsistenciaPdf(texto: string): string[] {
  const t = texto.trim();
  if (!t) return [];
  if (t.includes("/")) {
    return t
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (t.includes(",")) {
    return t
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (t.includes(";")) {
    return t
      .split(/\s*;\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (t.length > 16 && /\s/.test(t)) {
    return t.split(/\s+/).filter(Boolean);
  }
  return [t];
}

function ConsistenciaPdfText({ value }: { value: string }) {
  const linhas = linhasConsistenciaPdf(value);
  if (linhas.length === 0) return null;
  if (linhas.length === 1) return <>{linhas[0]}</>;
  return (
    <>
      {linhas.map((linha, i) => (
        <span key={`${i}-${linha}`}>
          {i > 0 ? <br /> : null}
          {linha}
        </span>
      ))}
    </>
  );
}

function ColunaNaAgua({
  rowSpan,
  heightPx,
  naProf,
  profMax,
}: {
  rowSpan: number;
  heightPx: number;
  naProf: number | null;
  profMax: number;
}) {
  const topPct =
    naProf != null && profMax > 0
      ? Math.min(100, Math.max(0, (naProf / profMax) * 100))
      : null;

  return (
    <td
      rowSpan={rowSpan}
      style={{
        border: PDF_BORDER,
        padding: 0,
        width: "4%",
        verticalAlign: "top",
        position: "relative",
        backgroundColor: "#ffffff",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: heightPx,
          minHeight: heightPx,
          boxSizing: "border-box",
        }}
      >
        {topPct != null && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "42%",
              top: `${topPct}%`,
              bottom: 0,
              width: 3,
              backgroundColor: "#2563eb",
              borderRadius: 1,
            }}
          />
        )}
      </div>
    </td>
  );
}

const GRAFICO_NSPT_X_MAX = 50;

function GraficoNspt({
  data,
  width,
  height,
  profMin = 0,
  profMax,
  profundidadesTabela = [],
}: {
  data: { prof: number; s12: number; s23: number }[];
  width: number;
  height: number;
  profMin?: number;
  profMax: number;
  /** Profundidades de cada linha da tabela (grelha horizontal alinhada). */
  profundidadesTabela?: number[];
}) {
  const padL = 6;
  const padR = 22;
  const padT = 28;
  const padB = 6;
  const plotX0 = padL;
  const plotX1 = width - padR;
  const plotY0 = padT;
  const plotY1 = height - padB;
  const innerW = plotX1 - plotX0;
  const innerH = plotY1 - plotY0;
  const xMax = GRAFICO_NSPT_X_MAX;

  const profHi = Math.max(profMax, 0.01);
  const profLo = Math.min(profMin, profHi);
  const profRange = Math.max(profHi - profLo, 0.01);

  const profY = (prof: number) =>
    plotY0 + ((prof - profLo) / profRange) * innerH;

  const toXY = (prof: number, xVal: number) => {
    const x =
      plotX0 + (Math.min(xMax, Math.max(0, xVal)) / xMax) * innerW;
    const y = profY(prof);
    return { x, y };
  };

  const pts23 = data
    .filter((d) => d.s23 > 0)
    .map((d) => toXY(d.prof, d.s23));
  const pts12 = data
    .filter((d) => d.s12 > 0)
    .map((d) => toXY(d.prof, d.s12));
  const poly23 = pts23.map((p) => `${p.x},${p.y}`).join(" ");
  const poly12 = pts12.map((p) => `${p.x},${p.y}`).join(" ");

  const ticksX = [0, 10, 20, 30, 40, 50];
  const ticksY = Array.from(
    { length: Math.ceil(profHi) + 1 },
    (_, i) => i,
  ).filter((m) => m <= profHi);

  const profsGrelha = [
    ...new Set([
      ...profundidadesTabela.map((p) => round2ProfSpt(p)),
      ...data.map((d) => d.prof),
    ]),
  ].sort((a, b) => a - b);

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x={0.5}
        y={0.5}
        width={width - 1}
        height={height - 1}
        fill="#ffffff"
        stroke="#000000"
        strokeWidth={1}
      />

      {/* Grelha vertical (golpes) */}
      {ticksX.map((v) => {
        const x = plotX0 + (v / xMax) * innerW;
        return (
          <line
            key={`vx-${v}`}
            x1={x}
            y1={plotY0}
            x2={x}
            y2={plotY1}
            stroke="#d1d5db"
            strokeWidth={0.75}
          />
        );
      })}

      {/* Grelha horizontal (profundidade) */}
      {profsGrelha.map((prof) => {
        const y = profY(prof);
        return (
          <line
            key={`hy-${prof}`}
            x1={plotX0}
            y1={y}
            x2={plotX1}
            y2={y}
            stroke="#e5e7eb"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Eixo X no topo — golpes */}
      {ticksX.map((v) => {
        const x = plotX0 + (v / xMax) * innerW;
        return (
          <text
            key={`tx-${v}`}
            x={x}
            y={12}
            textAnchor="middle"
            fontSize="6"
            fill="#000000"
            fontWeight={v === 0 ? 700 : 400}
          >
            {v}
          </text>
        );
      })}

      {/* Escala profundidade (direita) */}
      {ticksY.map((m) => {
        const y = profY(m);
        return (
          <text
            key={`ty-${m}`}
            x={width - 4}
            y={y + 2}
            textAnchor="end"
            fontSize="5.5"
            fill="#000000"
          >
            {m.toFixed(0)}
          </text>
        );
      })}

      {/* Legenda (canto superior direito do gráfico) */}
      <g transform={`translate(${plotX0 + innerW - 52}, 14)`}>
        <circle
          cx={4}
          cy={0}
          r={2.5}
          fill="#ffffff"
          stroke="#2563eb"
          strokeWidth={1}
        />
        <text x={10} y={2} fontSize="5.5" fill="#000000">
          2+3
        </text>
        <g transform="translate(0, 9)">
          <circle
            cx={4}
            cy={0}
            r={2.5}
            fill="#ffffff"
            stroke="#dc2626"
            strokeWidth={1}
          />
          <line
            x1={1}
            y1={0}
            x2={7}
            y2={0}
            stroke="#dc2626"
            strokeWidth={0.9}
          />
          <line
            x1={4}
            y1={-3}
            x2={4}
            y2={3}
            stroke="#dc2626"
            strokeWidth={0.9}
          />
          <text x={10} y={2} fontSize="5.5" fill="#000000">
            1+2
          </text>
        </g>
      </g>

      {/* Linhas 2+3 (azul) */}
      {poly23 && (
        <polyline
          fill="none"
          stroke="#2563eb"
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={poly23}
        />
      )}
      {pts23.map((p, i) => (
        <circle
          key={`b${i}`}
          cx={p.x}
          cy={p.y}
          r={2.5}
          fill="#ffffff"
          stroke="#2563eb"
          strokeWidth={1}
        />
      ))}

      {/* Linhas 1+2 (vermelho) */}
      {poly12 && (
        <polyline
          fill="none"
          stroke="#dc2626"
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={poly12}
        />
      )}
      {pts12.map((p, i) => (
        <g key={`r${i}`}>
          <circle
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="#ffffff"
            stroke="#dc2626"
            strokeWidth={1}
          />
          <line
            x1={p.x - 3}
            y1={p.y}
            x2={p.x + 3}
            y2={p.y}
            stroke="#dc2626"
            strokeWidth={0.9}
          />
          <line
            x1={p.x}
            y1={p.y - 3}
            x2={p.x}
            y2={p.y + 3}
            stroke="#dc2626"
            strokeWidth={0.9}
          />
        </g>
      ))}
    </svg>
  );
}

function textoAmostra(l: SptLinhaPdf): string {
  const parts = [l.solo, l.soloDetalhe, l.obs].filter(
    (s) => typeof s === "string" && s.trim().length > 0,
  );
  return parts.join(", ").toUpperCase() || "—";
}

function corBarraMaterial(l: SptLinhaPdf): string {
  const c = l.cor?.trim();
  if (c && /^#[0-9A-Fa-f]{3,8}$/.test(c)) return c;
  return corSoloSpt(l.solo);
}

function avancoEfetivoPdf(l: SptLinhaPdf): string {
  return (l.avanco ?? "").trim() || avancoPadraoParaProfSpt(l.prof);
}

export const SptRelatorioSoilsulPdf = forwardRef<HTMLDivElement, Props>(
  function SptRelatorioSoilsulPdf({ linhas, meta }, ref) {
    const m = {
      furo: meta.furoCodigo?.trim() || "—",
      cliente: meta.cliente?.trim() || "—",
      obra: meta.obra?.trim() || "—",
      local: meta.local?.trim() || "—",
      d0: meta.dataInicio?.trim() || "—",
      d1: meta.dataFim?.trim() || "—",
      pg: meta.pagina ?? 1,
      tg: meta.totalPaginas ?? 1,
      amExt: meta.amostradorExt?.trim() || "50,8",
      amInt: meta.amostradorInt?.trim() || "34,9",
      rev: meta.revestimento?.trim() || "—",
      revComp: meta.revestimentoComprimento?.trim() || "—",
      trado: meta.trado?.trim() || "—",
      hQueda: meta.alturaQueda?.trim() || "75 cm",
      peso: meta.pesoMartelo?.trim() || "65Kgf",
      sistema: meta.sistema?.trim() || "manual",
      cota: meta.cota?.trim() || "0",
      na: meta.nivelAgua?.trim() || "0,00",
      cn: meta.coordN?.trim() || "—",
      ce: meta.coordE?.trim() || "—",
      fuso: meta.fuso?.trim() || "—",
      end: meta.endereco?.trim() || "Rua Flávio Pires, 131, Araranguá - SC",
      sondador: meta.sondador?.trim() || "—",
      resp: meta.responsavel?.trim() || "—",
      crea: meta.crea?.trim() || "",
      contato: meta.rodapeContato?.trim() || RODAPE_CONTATO_PADRAO,
    };

    const naProfNum = parseProfMeta(meta.naProfundidade);

    const ord = useMemo(
      () => [...linhas].sort((a, b) => a.prof - b.prof),
      [linhas],
    );

    const profundidadesOrd = useMemo(() => ord.map((l) => l.prof), [ord]);

    const linhasGolpes = useMemo(
      () =>
        ord.map((l) => ({
          prof: l.prof,
          g1: l.g1,
          g2: l.g2,
          g3: l.g3,
          avanco: l.avanco,
        })),
      [ord],
    );

    const grafData = useMemo(
      () =>
        ord
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => avancoEfetivoPdf(l) !== "BT")
          .map(({ l, i }) => {
            const { s12, s23 } = somasGolpes30cmNaLinha(linhasGolpes, i);
            return { prof: l.prof, s12, s23 };
          }),
      [ord, linhasGolpes],
    );

    const nLin = ord.length;
    const hGraf = Math.max(nLin * ROW_H, 220);
    const wGraf = Math.max(165, Math.min(200, Math.round(hGraf * 0.55)));
    const profMax = nLin ? Math.max(...ord.map((l) => l.prof)) : 0;

    const metaCell: CSSProperties = {
      border: PDF_BORDER,
      padding: "5px 7px",
      fontSize: "7px",
      color: "#000000",
      verticalAlign: "middle" as const,
      overflow: "hidden",
      wordBreak: "break-word",
      boxSizing: "border-box",
    };

    const cell: CSSProperties = {
      border: PDF_BORDER,
      padding: "3px 4px",
      fontSize: "7px",
      color: "#000000",
      verticalAlign: "middle" as const,
      textAlign: "center" as const,
      height: ROW_H,
      boxSizing: "border-box" as const,
    };

    const hdr: CSSProperties = {
      ...cell,
      fontWeight: 700,
      backgroundColor: "#f3f4f6",
      height: "auto",
      minHeight: 32,
      padding: "5px 3px",
    };

    const coordBox: CSSProperties = {
      ...metaCell,
      width: "22%",
      verticalAlign: "top",
      padding: "5px 8px",
      lineHeight: 1.35,
    };

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
          position: "relative",
          boxSizing: "border-box",
          overflow: "visible",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "72px",
            fontWeight: 700,
            color: "#000000",
            opacity: 0.04,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          Folha {m.pg}
        </div>

        <div
          style={{
            border: PDF_BORDER,
            padding: "8px 10px",
            marginBottom: "6px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: PDF_BORDER,
              paddingBottom: "8px",
              marginBottom: "8px",
            }}
          >
            <LogoDataGeo />
            <div style={{ textAlign: "center", flex: 1, padding: "0 10px" }}>
              <div style={{ fontWeight: 700, fontSize: "9px" }}>
                SONDAGEM DE SIMPLES RECONHECIMENTO COM SPT
              </div>
              <div style={{ fontSize: "7px", marginTop: "3px" }}>
                ABNT NBR 6484:2020
              </div>
            </div>
            <div
              style={{
                border: PDF_BORDER,
                padding: "8px 12px",
                textAlign: "center",
                minWidth: "92px",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: "11px" }}>{m.furo}</div>
              <div style={{ fontSize: "7px", marginTop: "4px" }}>
                Página {m.pg}/{m.tg}
              </div>
            </div>
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              borderSpacing: 0,
              fontSize: "7px",
              tableLayout: "fixed",
              marginBottom: "6px",
            }}
          >
            <tbody>
              <tr>
                <td style={{ ...metaCell, fontWeight: 700, width: "12%" }}>
                  Cliente
                </td>
                <td style={{ ...metaCell, textAlign: "left" }} colSpan={2}>
                  {m.cliente}
                </td>
                <td
                  style={{
                    ...metaCell,
                    fontWeight: 700,
                    width: "10%",
                    textAlign: "center",
                  }}
                >
                  Início
                </td>
                <td style={{ ...metaCell, textAlign: "left", width: "14%" }}>
                  {m.d0}
                </td>
                <td style={coordBox} rowSpan={3}>
                  <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                    Coordenadas
                  </div>
                  <div>
                    <strong>Norte:</strong> {m.cn}
                  </div>
                  <div>
                    <strong>Leste:</strong> {m.ce}
                  </div>
                  <div>
                    <strong>Fuso:</strong> {m.fuso}
                  </div>
                </td>
              </tr>
              <tr>
                <td style={{ ...metaCell, fontWeight: 700 }}>Obra</td>
                <td style={{ ...metaCell, textAlign: "left" }} colSpan={2}>
                  {m.obra}
                </td>
                <td style={{ ...metaCell, fontWeight: 700, textAlign: "center" }}>
                  Término
                </td>
                <td style={{ ...metaCell, textAlign: "left" }}>{m.d1}</td>
              </tr>
              <tr>
                <td style={{ ...metaCell, fontWeight: 700 }}>Local</td>
                <td style={{ ...metaCell, textAlign: "left" }} colSpan={4}>
                  {m.local}
                </td>
              </tr>
            </tbody>
          </table>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "6.5px",
              tableLayout: "fixed",
            }}
          >
            <tbody>
              <tr>
                <td style={{ ...metaCell, textAlign: "left" }}>
                  <strong>Ø Amostrador:</strong> Ext.: {m.amExt} mm | Int.: {m.amInt}{" "}
                  mm
                </td>
                <td style={{ ...metaCell, textAlign: "left", width: "14%" }}>
                  <strong>Ø Revestimento:</strong> {m.rev} mm
                </td>
                <td style={{ ...metaCell, textAlign: "left", width: "12%" }}>
                  <strong>Ø trado:</strong> {m.trado} mm
                </td>
                <td style={{ ...metaCell, textAlign: "left" }} colSpan={2}>
                  <strong>Altura de Queda:</strong> {m.hQueda} | <strong>Peso:</strong>{" "}
                  {m.peso} | <strong>Sistema:</strong> {m.sistema}
                </td>
                <td style={{ ...metaCell, textAlign: "left", width: "28%" }}>
                  <strong>Cota:</strong> {m.cota} m | <strong>Revestimento:</strong>{" "}
                  {m.revComp} m | <strong>Nível de Água:</strong> {m.na} m (24 h)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            borderSpacing: 0,
            border: PDF_BORDER,
            tableLayout: "fixed",
            position: "relative",
            zIndex: 1,
          }}
        >
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "3.5%" }} />
            <col style={{ width: "3.5%" }} />
            <col style={{ width: "3%" }} />
            <col style={{ width: "4%" }} />
            <col style={{ width: "4%" }} />
            <col style={{ width: "3.5%" }} />
            <col style={{ width: "3.5%" }} />
            <col style={{ width: "3.5%" }} />
            <col style={{ width: "4%" }} />
            <col style={{ width: "4%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "19.5%" }} />
          </colgroup>
          <thead>
            <tr>
              <VerticalHdrCell thStyle={hdrVertical({ ...hdr, width: "4%" })}>
                Cota Rel. RN
              </VerticalHdrCell>
              <VerticalHdrCell thStyle={hdrVertical({ ...hdr, width: "3.5%" })}>
                N.A. 24 H
              </VerticalHdrCell>
              <VerticalHdrCell thStyle={hdrVertical({ ...hdr, width: "3.5%" })}>
                AVANÇO
              </VerticalHdrCell>
              <VerticalHdrCell thStyle={hdrVertical({ ...hdr, width: "3%" })}>
                REVES.
              </VerticalHdrCell>
              <VerticalHdrCell thStyle={hdrVertical({ ...hdr, width: "4%" })}>
                PROFUND.
              </VerticalHdrCell>
              <VerticalHdrCell thStyle={hdrVertical({ ...hdr, width: "4%" })}>
                Nº da Amostra
              </VerticalHdrCell>
              <th style={{ ...hdr, fontSize: "6px" }} colSpan={3}>
                Nº de Golpes de Penetração 15 cm
              </th>
              <th style={{ ...hdr, fontSize: "6px" }} colSpan={2}>
                Nº de Golpes de Penetração 30 cm
              </th>
              <th style={{ ...hdr, width: "18%", fontSize: "6px" }} rowSpan={2}>
                Gráfico NSPT
              </th>
              <ConsistenciaHdrCell thStyle={hdrVertical({ ...hdr, width: "5%" })} />
              <th style={{ ...hdr, width: "5%", fontSize: "6px" }} rowSpan={2}>
                Mudança
                <br />
                de Amostra
              </th>
              <th style={{ ...hdr, width: "19.5%", fontSize: "5.5px" }} rowSpan={2}>
                DESCRIÇÃO DAS AMOSTRAS
                <br />
                TIPO DE SOLO, COR E OBSERVAÇÃO
              </th>
            </tr>
            <tr>
              <th style={{ ...hdr, width: "3.5%" }}>1º</th>
              <th style={{ ...hdr, width: "3.5%" }}>2º</th>
              <th style={{ ...hdr, width: "3.5%" }}>3º</th>
              <th style={{ ...hdr, width: "4%" }}>1º + 2º</th>
              <th style={{ ...hdr, width: "4%" }}>2º + 3º</th>
            </tr>
          </thead>
          <tbody>
            {ord.map((l, i) => {
              const g1 = golpesSptNum(l.g1);
              const g2 = golpesSptNum(l.g2);
              const g3 = golpesSptNum(l.g3);
              const golpesSoma = golpesParaSomas30cmNaLinha(linhasGolpes, i);
              const { s12, s23 } = somasGolpes30cm(
                golpesSoma.g1,
                golpesSoma.g2,
                golpesSoma.g3,
              );
              const avEfetivo = avancoEfetivoPdf(l);
              const amostraSpan = rowSpanGrupoAmostraSpt(i, profundidadesOrd);
              const somasUnidasNaLinhaDeCima =
                i > 0 &&
                numeroAmostraSpt(ord[i - 1].prof) === numeroAmostraSpt(l.prof) &&
                avancoEfetivoPdf(ord[i - 1]) !== "BT";
              const camadaSpan = rowSpanCamadaSpt(i, ord);
              const inicioCamada = camadaSpan.exibir;
              const stripe = i % 2 === 1 ? "#f8fafc" : "#ffffff";
              const alturaCelula =
                (inicioCamada ? camadaSpan.span : 1) * ROW_H;

              return (
                <tr key={`${l.prof}-${i}`}>
                  <td style={{ ...cell, backgroundColor: stripe }} />
                  {i === 0 ? (
                    <ColunaNaAgua
                      rowSpan={nLin}
                      heightPx={hGraf}
                      naProf={naProfNum}
                      profMax={profMax}
                    />
                  ) : null}
                  <td style={{ ...cell, backgroundColor: stripe }}>
                    {avEfetivo || "—"}
                  </td>
                  <td
                    style={{
                      ...cell,
                      backgroundColor: stripe,
                      position: "relative",
                      padding: 0,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: 2,
                        bottom: 2,
                        width: 1,
                        backgroundColor: "#cbd5e1",
                        transform: "translateX(-50%)",
                      }}
                      aria-hidden
                    />
                    <span style={{ position: "relative", zIndex: 1 }}>
                      {(l.reves ?? "").trim() || ""}
                    </span>
                  </td>
                  <td style={{ ...cell, fontWeight: 600, backgroundColor: stripe }}>
                    {formatarProfSptPt(l.prof)}
                  </td>
                  {amostraSpan.exibir ? (
                    <td
                      rowSpan={amostraSpan.span}
                      style={{
                        ...cell,
                        backgroundColor: stripe,
                        verticalAlign: "middle",
                        fontWeight: 700,
                      }}
                    >
                      {numeroAmostraSpt(l.prof)}
                    </td>
                  ) : null}
                  <CelulaGolpePenetracao15
                    golpes={g1}
                    cm={cmPenetracaoPdf(avEfetivo, l.cm1 ?? 15)}
                  />
                  <CelulaGolpePenetracao15
                    golpes={g2}
                    cm={cmPenetracaoPdf(avEfetivo, l.cm2 ?? 15)}
                  />
                  <CelulaGolpePenetracao15
                    golpes={g3}
                    cm={cmPenetracaoPdf(avEfetivo, l.cm3 ?? 15)}
                  />
                  {amostraSpan.exibir && avEfetivo !== "BT" ? (
                    <>
                      <td
                        rowSpan={amostraSpan.span}
                        style={{
                          ...cell,
                          backgroundColor: stripe,
                          verticalAlign: "middle",
                          fontWeight: 600,
                        }}
                      >
                        {temGolpesParaColuna30cm(
                          golpesSoma.g1,
                          golpesSoma.g2,
                          golpesSoma.g3,
                          "s12",
                        )
                          ? s12
                          : ""}
                      </td>
                      <td
                        rowSpan={amostraSpan.span}
                        style={{
                          ...cell,
                          backgroundColor: stripe,
                          verticalAlign: "middle",
                          fontWeight: 700,
                        }}
                      >
                        {temGolpesParaColuna30cm(
                          golpesSoma.g1,
                          golpesSoma.g2,
                          golpesSoma.g3,
                          "s23",
                        )
                          ? s23
                          : ""}
                      </td>
                    </>
                  ) : !somasUnidasNaLinhaDeCima ? (
                    <>
                      <td style={{ ...cell, backgroundColor: stripe }} />
                      <td style={{ ...cell, backgroundColor: stripe }} />
                    </>
                  ) : null}
                  {i === 0 ? (
                    <td
                      rowSpan={nLin}
                      style={{
                        ...cell,
                        padding: 0,
                        verticalAlign: "top",
                        width: wGraf,
                        minWidth: wGraf,
                        height: hGraf,
                        backgroundColor: "#ffffff",
                      }}
                    >
                      <GraficoNspt
                        data={grafData}
                        width={wGraf}
                        height={hGraf}
                        profMax={profMax}
                        profundidadesTabela={profundidadesOrd}
                      />
                    </td>
                  ) : null}
                  <td
                    style={{
                      ...cell,
                      fontSize: "7px",
                      backgroundColor: stripe,
                      overflow: "hidden",
                      wordBreak: "break-word",
                      lineHeight: 1.2,
                      padding: "3px 2px",
                    }}
                  >
                    <ConsistenciaPdfText value={(l.consistencia ?? "").trim()} />
                  </td>
                  <td style={{ ...cell, backgroundColor: stripe }}>
                    {inicioCamada && i > 0
                      ? formatarProfSptPt(l.prof)
                      : ""}
                  </td>
                  {inicioCamada ? (
                    <td
                      rowSpan={camadaSpan.span}
                      style={{
                        ...cell,
                        padding: 0,
                        verticalAlign: "top" as const,
                        textAlign: "left" as const,
                        backgroundColor: "#ffffff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "stretch",
                          minHeight: alturaCelula,
                          height: "100%",
                          boxSizing: "border-box",
                        }}
                      >
                        <div
                          style={{
                            width: 10,
                            flexShrink: 0,
                            backgroundColor: corBarraMaterial(l),
                            borderRight: PDF_BORDER,
                          }}
                          title={l.solo || "Material"}
                        />
                        <div
                          style={{
                            flex: 1,
                            padding: "4px 6px",
                            fontSize: "7px",
                            lineHeight: 1.3,
                            color: "#000000",
                            fontWeight: 600,
                          }}
                        >
                          {textoAmostra(l)}
                        </div>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>

        {meta.fotosCampo && meta.fotosCampo.length > 0 && (
          <RelatorioFotosPdfSection fotos={meta.fotosCampo} border={PDF_BORDER} />
        )}

        <div
          style={{
            marginTop: "8px",
            border: PDF_BORDER,
            padding: "6px 8px",
            fontSize: "6px",
            lineHeight: 1.35,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ marginBottom: "4px" }}>
            <strong>Avanço:</strong> TR — trado · LV — lavagem · PE — percussão · TD
            — trado desmontado · BT — bate-estaca · S — amostra indeformada
          </div>
          <div>
            <strong>Argila — consistência:</strong> MM — muito mole · M — mole · MD
            — média · R — rígida · MR — muito rígida · D — dura &nbsp;|&nbsp;{" "}
            <strong>Areia — compactação:</strong> F — fofa · PC — pouco compacta ·
            MC — média compacta · C — compacta · SC — muito compacta
          </div>
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "6px",
            fontSize: "7px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <thead>
            <tr>
              <th
                colSpan={3}
                style={{
                  ...hdr,
                  textAlign: "left",
                  padding: "4px 8px",
                }}
              >
                Lavagem por Tempo
              </th>
            </tr>
            <tr>
              <th style={{ ...hdr, width: "34%" }}>Profundidade (m)</th>
              <th style={{ ...hdr, width: "33%" }}>Tempo (min)</th>
              <th style={{ ...hdr, width: "33%" }}>Nível d&apos;água (m)</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map((k) => (
              <tr key={k}>
                <td style={{ ...cell, height: 22 }} />
                <td style={{ ...cell, height: 22 }} />
                <td style={{ ...cell, height: 22 }} />
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            marginTop: "10px",
            fontSize: "7px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ borderTop: PDF_BORDER, paddingTop: "6px" }}>
            <strong>Sondador:</strong>
            <br />
            {m.sondador}
          </div>
          <div style={{ borderTop: PDF_BORDER, paddingTop: "6px", textAlign: "right" }}>
            <strong>Responsável Técnico:</strong>
            <br />
            {m.resp}
            {m.crea ? ` — CREA: ${m.crea}` : ""}
          </div>
        </div>

        {meta.mapaLatitude != null &&
          meta.mapaLongitude != null &&
          Number.isFinite(meta.mapaLatitude) &&
          Number.isFinite(meta.mapaLongitude) && (
            <div
              data-spt-pdf-has-map
              style={{
                marginTop: "10px",
                position: "relative",
                zIndex: 1,
              }}
            >
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
                furoCodigo={meta.furoCodigo}
                furoDescricao={
                  [meta.obra, meta.local].filter(Boolean).join(" · ") || undefined
                }
              />
            </div>
          )}

        <div
          style={{
            marginTop: "8px",
            paddingTop: "6px",
            borderTop: PDF_BORDER,
            fontSize: "6px",
            textAlign: "center",
            color: "#374151",
            position: "relative",
            zIndex: 1,
          }}
        >
          {m.end}
          <br />
          {m.contato}
        </div>
      </div>
    );
  },
);

SptRelatorioSoilsulPdf.displayName = "SptRelatorioSoilsulPdf";
