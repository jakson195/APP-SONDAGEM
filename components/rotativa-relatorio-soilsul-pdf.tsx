"use client";

import type { CSSProperties } from "react";
import { forwardRef, useMemo } from "react";
import { RelatorioFotosPdfSection } from "@/components/relatorio-fotos-pdf-section";
import { SptPdfStaticMap } from "@/components/spt-pdf-static-map";
import { textoQualidadeRqd } from "@/lib/rqd";

export type RotativaLinhaPdf = {
  de: number;
  ate: number;
  tipo: string;
  cor: string;
  rqd: number;
  recuperacao: number;
  descricao: string;
  /** Se vazio, usa a classificação automática a partir do RQD. */
  qualidade?: string;
};

export type RotativaMetaPdf = {
  furoCodigo?: string;
  cliente?: string;
  obra?: string;
  local?: string;
  ref?: string;
  dataInicio?: string;
  dataFim?: string;
  nivelAgua?: string;
  cotaBoca?: string;
  revestimento?: string;
  coordN?: string;
  coordE?: string;
  pagina?: number;
  totalPaginas?: number;
  responsavel?: string;
  endereco?: string;
  fotosCampo?: string[];
  /** Ponto WGS84 para mapa estático no PDF. */
  mapaLatitude?: number | null;
  mapaLongitude?: number | null;
  mapaZoom?: number;
};

type Props = {
  linhas: RotativaLinhaPdf[];
  dadosRQD: { prof: number; RQD: number }[];
  escalaPxPorMetro: number;
  meta: RotativaMetaPdf;
};

/** Perfil com hachuras só em hex/rgb (compatível com html2canvas). */
function estiloPerfil(tipo: string, height: number): CSSProperties {
  const base: CSSProperties = {
    height,
    minHeight: 28,
    border: "1px solid #000000",
    boxSizing: "border-box",
  };
  if (!tipo) {
    return { ...base, backgroundColor: "#e7e5e4" };
  }
  const n = tipo.toLowerCase();
  if (n.includes("argila")) {
    return {
      ...base,
      backgroundColor: "#1a1a1a",
      backgroundImage:
        "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.32) 3px, rgba(255,255,255,0.32) 4px)",
    };
  }
  if (n.includes("areia fina")) {
    return {
      ...base,
      backgroundColor: "#fce7f3",
      backgroundImage:
        "radial-gradient(circle, #9d174d 0.65px, transparent 1.1px)",
      backgroundSize: "5px 5px",
    };
  }
  if (n.includes("areia média") || n.includes("areia media")) {
    return {
      ...base,
      backgroundColor: "#fbcfe8",
      backgroundImage:
        "radial-gradient(circle, #831843 0.7px, transparent 1.15px)",
      backgroundSize: "5px 5px",
    };
  }
  if (n.includes("areia grossa")) {
    return {
      ...base,
      backgroundColor: "#f9a8d4",
      backgroundImage:
        "radial-gradient(circle, #701a3d 0.85px, transparent 1.2px)",
      backgroundSize: "4px 4px",
    };
  }
  if (n.includes("areia")) {
    return {
      ...base,
      backgroundColor: "#fbcfe8",
      backgroundImage:
        "radial-gradient(circle, #831843 0.7px, transparent 1.15px)",
      backgroundSize: "5px 5px",
    };
  }
  if (n.includes("silte")) {
    return {
      ...base,
      backgroundColor: "#fed7aa",
      backgroundImage:
        "repeating-linear-gradient(0deg, transparent, transparent 2px, #c2410c 2px, #c2410c 3px)",
      backgroundSize: "100% 6px",
    };
  }
  if (n.includes("rocha sã") || n.includes("rocha sa")) {
    return { ...base, backgroundColor: "#374151" };
  }
  if (n.includes("rocha")) {
    return {
      ...base,
      backgroundColor: "#9ca3af",
      backgroundImage:
        "repeating-linear-gradient(45deg, transparent, transparent 4px, #4b5563 4px, #4b5563 5px)",
    };
  }
  if (n.includes("residual")) {
    return {
      ...base,
      backgroundColor: "#a3b18a",
      backgroundImage:
        "linear-gradient(90deg, rgba(77,92,58,0.25) 1px, transparent 1px), linear-gradient(0deg, rgba(77,92,58,0.25) 1px, transparent 1px)",
      backgroundSize: "6px 6px",
    };
  }
  return { ...base, backgroundColor: "#e7e5e4" };
}

function GraficoCentral({
  data,
  width,
  height,
}: {
  data: { prof: number; RQD: number }[];
  width: number;
  height: number;
}) {
  const padL = 44;
  const padR = 8;
  const padT = 20;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  if (data.length === 0) {
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <rect width={width} height={height} fill="#fafafa" stroke="#000000" />
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="9" fill="#666666">
          Recuperação / RQD × profundidade
        </text>
      </svg>
    );
  }

  const profs = data.map((d) => d.prof);
  const profHi = Math.max(...profs, 1);
  const profLo = Math.min(...profs, 0);
  const profRange = Math.max(profHi - profLo, 0.01);

  const pts = data.map((d) => {
    const x = padL + (Math.min(100, Math.max(0, d.RQD)) / 100) * innerW;
    const y = padT + ((profHi - d.prof) / profRange) * innerH;
    return { x, y };
  });
  const poly = pts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={width} height={height} fill="#ffffff" stroke="#000000" />
      <text x={width / 2} y={14} textAnchor="middle" fontSize="8" fontWeight="600" fill="#000000">
        Recuperação / RQD (%) × profundidade (m)
      </text>
      {[0, 25, 50, 75, 100].map((v) => {
        const x = padL + (v / 100) * innerW;
        return (
          <g key={v}>
            <line
              x1={x}
              y1={padT}
              x2={x}
              y2={padT + innerH}
              stroke="#d1d5db"
              strokeDasharray="2 2"
            />
            <text x={x} y={height - 6} textAnchor="middle" fontSize="7" fill="#000000">
              {v}
            </text>
          </g>
        );
      })}
      <polyline fill="none" stroke="#0f766e" strokeWidth="2" points={poly} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#0f766e" />
      ))}
      <text
        x={8}
        y={padT + innerH / 2}
        fontSize="7"
        fill="#000000"
        transform={`rotate(-90 8 ${padT + innerH / 2})`}
      >
        Prof. (m)
      </text>
    </svg>
  );
}

export const RotativaRelatorioSoilsulPdf = forwardRef<HTMLDivElement, Props>(
  function RotativaRelatorioSoilsulPdf(
    { linhas, dadosRQD, escalaPxPorMetro, meta },
    ref,
  ) {
    const m = {
      furo: meta.furoCodigo?.trim() || "—",
      cliente: meta.cliente?.trim() || "—",
      obra: meta.obra?.trim() || "—",
      local: meta.local?.trim() || "—",
      ref: meta.ref?.trim() || "—",
      d0: meta.dataInicio?.trim() || "—",
      d1: meta.dataFim?.trim() || "—",
      na: meta.nivelAgua?.trim() || "Não medido",
      cota: meta.cotaBoca?.trim() || "—",
      rev: meta.revestimento?.trim() || "—",
      cn: meta.coordN?.trim() || "—",
      ce: meta.coordE?.trim() || "—",
      pg: meta.pagina ?? 1,
      tg: meta.totalPaginas ?? 1,
      resp: meta.responsavel?.trim() || "—",
      end: meta.endereco?.trim() || "Rua Flávio Pires, 131, Araranguá - SC",
    };

    const profMax = useMemo(
      () => (linhas.length ? Math.max(...linhas.map((l) => l.ate)) : 0),
      [linhas],
    );

    const alturaTotal = useMemo(
      () =>
        linhas.reduce(
          (s, l) => s + Math.max((l.ate - l.de) * escalaPxPorMetro, 28),
          0,
        ),
      [linhas, escalaPxPorMetro],
    );

    const nLin = linhas.length;
    const wGraf = 210;
    const hGraf = Math.max(alturaTotal, 220);

    const cell: CSSProperties = {
      border: "1px solid #000000",
      padding: "3px 4px",
      fontSize: "8px",
      color: "#000000",
      verticalAlign: "top" as const,
    };

    const hdr: CSSProperties = {
      ...cell,
      fontWeight: 700,
      textAlign: "center" as const,
      backgroundColor: "#f3f4f6",
    };

    return (
      <div
        ref={ref}
        style={{
          width: "794px",
          minWidth: "794px",
          maxWidth: "794px",
          backgroundColor: "#ffffff",
          padding: "12px 14px 16px",
          color: "#000000",
          fontSize: "9px",
          lineHeight: 1.25,
          fontFamily: "Arial, Helvetica, sans-serif",
          boxSizing: "border-box",
          overflow: "visible",
        }}
      >
        <div
          style={{
            border: "2px solid #000000",
            padding: "8px 10px",
            marginBottom: "8px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              borderBottom: "1px solid #000000",
              paddingBottom: "6px",
              marginBottom: "6px",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: "14px", letterSpacing: "-0.5px" }}>
              SOILS
              <span style={{ fontWeight: 400 }}>UL</span>
            </div>
            <div style={{ textAlign: "center", flex: 1, padding: "0 8px" }}>
              <div style={{ fontWeight: 700, fontSize: "10px" }}>
                SOILSUL SONDAGENS E GEOTECNIA
              </div>
              <div style={{ fontSize: "8px", marginTop: "2px" }}>
                Sondagem de Reconhecimento Rotativa
              </div>
              <div style={{ fontSize: "7px", marginTop: "2px" }}>
                ABNT NBR 6484:2020 · NBR 6502:2022
              </div>
            </div>
            <div style={{ textAlign: "right", fontWeight: 700, fontSize: "10px" }}>
              {m.furo}
              <div style={{ fontSize: "8px", fontWeight: 400 }}>
                Pág. {m.pg}/{m.tg}
              </div>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8px" }}>
            <tbody>
              <tr>
                <td style={{ ...cell, width: "14%", fontWeight: 700 }}>Cliente</td>
                <td style={{ ...cell, width: "36%" }} colSpan={2}>
                  {m.cliente}
                </td>
                <td style={{ ...cell, width: "14%", fontWeight: 700 }}>Ref.</td>
                <td style={{ ...cell, width: "36%" }} colSpan={2}>
                  {m.ref}
                </td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Obra</td>
                <td style={{ ...cell }} colSpan={2}>
                  {m.obra}
                </td>
                <td style={{ ...cell, fontWeight: 700 }}>Data</td>
                <td style={{ ...cell }} colSpan={2}>
                  {m.d0} a {m.d1}
                </td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Local</td>
                <td style={{ ...cell }} colSpan={5}>
                  {m.local}
                </td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Nível d&apos;água</td>
                <td style={{ ...cell }} colSpan={2}>
                  {m.na}
                </td>
                <td style={{ ...cell, fontWeight: 700 }}>Cota boca (m)</td>
                <td style={{ ...cell }} colSpan={2}>
                  {m.cota}
                </td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 700 }}>Revestimento (m)</td>
                <td style={{ ...cell }} colSpan={2}>
                  {m.rev}
                </td>
                <td style={{ ...cell, fontWeight: 700 }}>Coord. (SIRGAS2000)</td>
                <td style={{ ...cell }} colSpan={2}>
                  N: {m.cn} &nbsp; E: {m.ce}
                </td>
              </tr>
            </tbody>
          </table>

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
        </div>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            border: "1px solid #000000",
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr>
              <th style={{ ...hdr, width: "9%" }}>Prof. (m)</th>
              <th style={{ ...hdr, width: "8%" }}>Perfuração</th>
              <th style={{ ...hdr, width: "7%" }}>Rec. %</th>
              <th style={{ ...hdr, width: "7%" }}>RQD %</th>
              <th style={{ ...hdr, width: "24%" }}>Gráfico</th>
              <th style={{ ...hdr, width: "11%" }}>Perfil</th>
              <th style={{ ...hdr, width: "34%" }}>Classificação do material</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const h = Math.max((l.ate - l.de) * escalaPxPorMetro, 28);
              return (
                <tr key={i}>
                  <td style={{ ...cell, textAlign: "center" }}>
                    {l.de.toFixed(2)}
                    <br />
                    <span style={{ fontSize: "7px" }}>↓</span>
                    <br />
                    {l.ate.toFixed(2)}
                  </td>
                  <td style={{ ...cell, padding: 0, textAlign: "center" }}>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        height: h,
                        minHeight: 28,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          backgroundColor: "#d4a574",
                          borderBottom: "1px solid #000000",
                          fontSize: "7px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          color: "#000000",
                        }}
                      >
                        RS
                      </div>
                      <div
                        style={{
                          flex: 0.35,
                          minHeight: 10,
                          backgroundColor: "#dc2626",
                          fontSize: "7px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          color: "#ffffff",
                        }}
                      >
                        BQ
                      </div>
                    </div>
                  </td>
                  <td style={{ ...cell, textAlign: "center" }}>{l.recuperacao}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{l.rqd}</td>
                  {i === 0 ? (
                    <td
                      rowSpan={nLin}
                      style={{
                        ...cell,
                        padding: 0,
                        verticalAlign: "top",
                        backgroundColor: "#ffffff",
                      }}
                    >
                      <GraficoCentral data={dadosRQD} width={wGraf} height={hGraf} />
                    </td>
                  ) : null}
                  <td style={{ ...cell, padding: 0 }}>
                    <div style={estiloPerfil(l.tipo, h)} title={l.tipo || "Perfil"} />
                  </td>
                  <td style={{ ...cell, fontSize: "8px" }}>
                    <strong>
                      {l.de.toFixed(2)} – {l.ate.toFixed(2)} m
                    </strong>
                    <br />
                    {l.tipo ? `${l.tipo}. ` : ""}
                    {l.descricao || "—"}
                    <br />
                    <span style={{ fontSize: "7px", color: "#374151" }}>
                      RQD: {l.rqd}% — {textoQualidadeRqd(l.rqd, l.qualidade)}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={7} style={{ ...cell, fontWeight: 700, textAlign: "center" }}>
                LIMITE DE SONDAGEM — profundidade final {profMax.toFixed(2)} m
              </td>
            </tr>
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
            border: "1px solid #000000",
            padding: "8px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: "6px",
            fontSize: "7px",
          }}
        >
          <div style={{ border: "1px solid #000000", padding: "4px" }}>
            <strong>RQD (%)</strong>
            <br />
            &lt;25 muito fraca · 25–50 fraca · 50–75 regular · 75–90 boa · &gt;90 excelente
          </div>
          <div style={{ border: "1px solid #000000", padding: "4px" }}>
            <strong>Alteração</strong>
            <br />
            Graus I a V — descrição de campo / NBR 6484
          </div>
          <div style={{ border: "1px solid #000000", padding: "4px" }}>
            <strong>Consistência / compactação</strong>
            <br />
            Conforme material e observação
          </div>
          <div style={{ border: "1px solid #000000", padding: "4px" }}>
            <strong>Fraturamento</strong>
            <br />
            Avaliação por RQD e testemunho
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "8px",
            fontSize: "8px",
            borderTop: "1px solid #000000",
            paddingTop: "6px",
          }}
        >
          <div>
            <strong>Inclinação:</strong> 90° (vertical)
            <br />
            {m.end}
          </div>
          <div style={{ textAlign: "right" }}>
            <strong>Responsável técnico:</strong>
            <br />
            {m.resp}
          </div>
          <div
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontSize: "7px",
              fontWeight: 600,
              letterSpacing: "1px",
              color: "#000000",
            }}
          >
            CONFORME NBR 6502:2022
          </div>
        </div>
      </div>
    );
  },
);
