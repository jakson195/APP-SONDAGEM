"use client";

import type { CSSProperties, ReactNode } from "react";
import { forwardRef, useMemo } from "react";
import { RelatorioFotosPdfSection } from "@/components/relatorio-fotos-pdf-section";
import { SptPdfStaticMap } from "@/components/spt-pdf-static-map";
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
  revestimento?: string;
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
  responsavel?: string;
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

const ROW_H = 30;
/** Bordas finas para PDF legível (html2canvas tende a engrossar traços). */
const PDF_BORDER = "1px solid #1f2937";

function cmIntervalo(l: SptLinhaPdf, i: 1 | 2 | 3): number {
  const v = i === 1 ? l.cm1 : i === 2 ? l.cm2 : l.cm3;
  if (v !== undefined && Number.isFinite(v)) return v;
  return 15;
}

function celGolpesCm(
  cellStyle: CSSProperties,
  g: number,
  cm: number,
): ReactNode {
  return (
    <td
      style={{
        ...cellStyle,
        padding: "3px 2px",
        lineHeight: 1.15,
        verticalAlign: "middle",
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 700, textAlign: "center" }}>{g}</div>
      <div style={{ fontSize: "6px", color: "#374151", textAlign: "center" }}>
        {cm}
      </div>
    </td>
  );
}

function GraficoNspt({
  data,
  width,
  height,
}: {
  data: { prof: number; s12: number; s23: number }[];
  width: number;
  height: number;
}) {
  const padL = 34;
  const padR = 8;
  const padT = 18;
  const padB = 34;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const xMax =
    data.length === 0
      ? 50
      : Math.ceil(
          Math.max(50, ...data.flatMap((d) => [d.s12, d.s23]), 1) / 10,
        ) * 10;

  if (data.length === 0) {
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <rect
          width={width}
          height={height}
          fill="#ffffff"
          stroke="#374151"
          strokeWidth={1}
        />
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          fontSize="8"
          fill="#666666"
        >
          Gráfico NSPT × profundidade
        </text>
      </svg>
    );
  }

  const profs = data.map((d) => d.prof);
  const profHi = Math.max(...profs, 1);
  const profLo = Math.min(...profs, 0);
  const profRange = Math.max(profHi - profLo, 0.01);

  const toXY = (prof: number, xVal: number) => {
    const x = padL + (Math.min(xMax, Math.max(0, xVal)) / xMax) * innerW;
    const y = padT + ((profHi - prof) / profRange) * innerH;
    return { x, y };
  };

  const pts23 = data.map((d) => toXY(d.prof, d.s23));
  const pts12 = data.map((d) => toXY(d.prof, d.s12));
  const poly23 = pts23.map((p) => `${p.x},${p.y}`).join(" ");
  const poly12 = pts12.map((p) => `${p.x},${p.y}`).join(" ");

  const ticks = [0, 10, 20, 30, 40, 50].filter((t) => t <= xMax);
  if (!ticks.includes(xMax) && xMax > 50) {
    ticks.push(xMax);
  }

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        width={width}
        height={height}
        fill="#ffffff"
        stroke="#374151"
        strokeWidth={1}
      />
      {ticks.map((v) => {
        const x = padL + (v / xMax) * innerW;
        return (
          <g key={v}>
            <line
              x1={x}
              y1={padT}
              x2={x}
              y2={padT + innerH}
              stroke="#e5e7eb"
              strokeDasharray="2 2"
            />
            <text
              x={x}
              y={height - 22}
              textAnchor="middle"
              fontSize="6"
              fill="#000000"
            >
              {v}
            </text>
          </g>
        );
      })}
      <text
        x={padL + innerW / 2}
        y={height - 8}
        textAnchor="middle"
        fontSize="6"
        fill="#000000"
      >
        Golpes
      </text>
      <polyline
        fill="none"
        stroke="#2563eb"
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={poly23}
      />
      {pts23.map((p, i) => (
        <circle key={`b${i}`} cx={p.x} cy={p.y} r="2" fill="#2563eb" />
      ))}
      <polyline
        fill="none"
        stroke="#dc2626"
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={poly12}
      />
      {pts12.map((p, i) => (
        <circle key={`r${i}`} cx={p.x} cy={p.y} r="2" fill="#dc2626" />
      ))}
      <text
        x={6}
        y={padT + innerH / 2}
        fontSize="6"
        fill="#000000"
        transform={`rotate(-90 6 ${padT + innerH / 2})`}
      >
        Prof. (m)
      </text>
      <g transform={`translate(${padL}, 10)`}>
        <circle cx={4} cy={0} r="2" fill="#2563eb" />
        <text x={9} y={2} fontSize="6" fill="#000000">
          2º+3º
        </text>
        <circle cx={50} cy={0} r="2" fill="#dc2626" />
        <text x={55} y={2} fontSize="6" fill="#000000">
          1º+2º
        </text>
      </g>
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
      trado: meta.trado?.trim() || "—",
      hQueda: meta.alturaQueda?.trim() || "75 cm",
      peso: meta.pesoMartelo?.trim() || "65 kgf",
      sistema: meta.sistema?.trim() || "manual",
      cota: meta.cota?.trim() || "—",
      na: meta.nivelAgua?.trim() || "—",
      naProf: meta.naProfundidade?.trim() || "—",
      cn: meta.coordN?.trim() || "—",
      ce: meta.coordE?.trim() || "—",
      fuso: meta.fuso?.trim() || "—",
      end: meta.endereco?.trim() || "Rua Flávio Pires, 131, Araranguá - SC",
      resp: meta.responsavel?.trim() || "—",
    };

    const ord = useMemo(
      () => [...linhas].sort((a, b) => a.prof - b.prof),
      [linhas],
    );

    const grafData = useMemo(
      () =>
        ord.map((l) => ({
          prof: l.prof,
          s12: l.g1 + l.g2,
          s23: l.g2 + l.g3,
        })),
      [ord],
    );

    const nLin = ord.length;
    const hGraf = Math.max(nLin * ROW_H, 200);
    /** Largura alinhada à coluna (~19% da grelha em ~770px úteis). */
    const wGraf = 142;
    const profMax = nLin ? Math.max(...ord.map((l) => l.prof)) : 0;

    const metaCell: CSSProperties = {
      border: PDF_BORDER,
      padding: "6px 8px",
      fontSize: "7px",
      color: "#000000",
      verticalAlign: "middle" as const,
    };

    const cell: CSSProperties = {
      border: PDF_BORDER,
      padding: "4px 4px",
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
      minHeight: 36,
      padding: "6px 4px",
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
            marginBottom: "8px",
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
            <div>
              <div style={{ fontWeight: 800, fontSize: "13px" }}>
                SOILS
                <span style={{ fontWeight: 400 }}>UL</span>
              </div>
              <div style={{ fontSize: "7px", marginTop: "2px", fontWeight: 600 }}>
                SOILSUL SONDAGENS E GEOTECNIA
              </div>
            </div>
            <div style={{ textAlign: "center", flex: 1, padding: "0 8px" }}>
              <div style={{ fontWeight: 700, fontSize: "9px" }}>
                SONDAGEM DE SIMPLES RECONHECIMENTO COM SPT
              </div>
              <div style={{ fontSize: "7px", marginTop: "2px" }}>
                ABNT NBR 6484:2020
              </div>
            </div>
            <div
              style={{
                border: PDF_BORDER,
                padding: "8px 10px",
                textAlign: "center",
                minWidth: "88px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
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
            }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    ...metaCell,
                    fontWeight: 700,
                    textAlign: "left",
                    verticalAlign: "middle",
                  }}
                >
                  Cliente
                </td>
                <td
                  style={{ ...metaCell, textAlign: "left", verticalAlign: "middle" }}
                  colSpan={3}
                >
                  {m.cliente}
                </td>
                <td
                  style={{
                    ...metaCell,
                    fontWeight: 700,
                    textAlign: "center",
                    width: "11%",
                  }}
                >
                  Início
                </td>
                <td style={{ ...metaCell, textAlign: "left", verticalAlign: "middle" }}>
                  {m.d0}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    ...metaCell,
                    fontWeight: 700,
                    textAlign: "left",
                    verticalAlign: "middle",
                  }}
                >
                  Obra
                </td>
                <td
                  style={{ ...metaCell, textAlign: "left", verticalAlign: "middle" }}
                  colSpan={3}
                >
                  {m.obra}
                </td>
                <td
                  style={{
                    ...metaCell,
                    fontWeight: 700,
                    textAlign: "center",
                    width: "11%",
                  }}
                >
                  Término
                </td>
                <td style={{ ...metaCell, textAlign: "left", verticalAlign: "middle" }}>
                  {m.d1}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    ...metaCell,
                    fontWeight: 700,
                    textAlign: "left",
                    verticalAlign: "middle",
                  }}
                >
                  Local
                </td>
                <td
                  style={{ ...metaCell, textAlign: "left", verticalAlign: "middle" }}
                  colSpan={5}
                >
                  {m.local}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    ...metaCell,
                    fontWeight: 700,
                    textAlign: "left",
                    verticalAlign: "middle",
                  }}
                  colSpan={2}
                >
                  Amostrador
                </td>
                <td
                  style={{ ...metaCell, textAlign: "left", verticalAlign: "middle" }}
                  colSpan={4}
                >
                  Ext.: {m.amExt} mm | Int.: {m.amInt} mm · Revest.: {m.rev} · Trado:{" "}
                  {m.trado}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    ...metaCell,
                    fontWeight: 700,
                    textAlign: "left",
                    verticalAlign: "middle",
                  }}
                  colSpan={2}
                >
                  Martelo / sistema
                </td>
                <td
                  style={{ ...metaCell, textAlign: "left", verticalAlign: "middle" }}
                  colSpan={4}
                >
                  Altura queda: {m.hQueda} | Peso: {m.peso} | Sistema: {m.sistema}
                </td>
              </tr>
              <tr>
                <td
                  style={{
                    ...metaCell,
                    fontWeight: 700,
                    textAlign: "left",
                    verticalAlign: "middle",
                  }}
                  colSpan={2}
                >
                  Cota / N.A. / Coordenadas
                </td>
                <td
                  style={{ ...metaCell, textAlign: "left", verticalAlign: "middle" }}
                  colSpan={4}
                >
                  Cota: {m.cota} m · N. água: {m.na}
                  {m.naProf !== "—" ? ` (${m.naProf} m, 24 h)` : ""} · N: {m.cn} · E:{" "}
                  {m.ce} · Fuso: {m.fuso}
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
            borderSpacing: 0,
            border: PDF_BORDER,
            tableLayout: "fixed",
            position: "relative",
            zIndex: 1,
          }}
        >
          <thead>
            <tr>
              <th style={{ ...hdr, width: "5%" }} rowSpan={2}>
                Cota
                <br />
                Rel. RN
              </th>
              <th style={{ ...hdr, width: "4%" }} rowSpan={2}>
                N.A
                <br />
                24 H
              </th>
              <th style={{ ...hdr, width: "5%" }} rowSpan={2}>
                AVANÇO
              </th>
              <th style={{ ...hdr, width: "4%" }} rowSpan={2}>
                REVES.
              </th>
              <th style={{ ...hdr, width: "6%" }} rowSpan={2}>
                PROFUN.
              </th>
              <th style={{ ...hdr, width: "5%" }} rowSpan={2}>
                Nº
                <br />
                Amost.
              </th>
              <th style={{ ...hdr }} colSpan={3}>
                15 cm — N (bat.) / cm (penetração)
              </th>
              <th style={{ ...hdr }} colSpan={2}>
                Soma N (30 cm)
              </th>
              <th style={{ ...hdr, width: "19%" }} rowSpan={2}>
                Gráfico NSPT
              </th>
              <th
                style={{
                  ...hdr,
                  width: "4%",
                  minWidth: 34,
                  fontSize: "6px",
                  lineHeight: 1.25,
                  padding: "6px 3px",
                }}
                rowSpan={2}
              >
                <span style={{ display: "block", textAlign: "center" }}>Consist.</span>
                <span style={{ display: "block", textAlign: "center" }}>compac.</span>
              </th>
              <th style={{ ...hdr, width: "6%" }} rowSpan={2}>
                Mudança
                <br />
                amostra
              </th>
              <th style={{ ...hdr, width: "20%" }} rowSpan={2}>
                Descrição das amostras — tipo de solo, cor e observação
              </th>
            </tr>
            <tr>
              <th style={{ ...hdr, width: "4%" }}>
                1º
                <br />
                <span style={{ fontSize: "6px", fontWeight: 400 }}>N · cm</span>
              </th>
              <th style={{ ...hdr, width: "4%" }}>
                2º
                <br />
                <span style={{ fontSize: "6px", fontWeight: 400 }}>N · cm</span>
              </th>
              <th style={{ ...hdr, width: "4%" }}>
                3º
                <br />
                <span style={{ fontSize: "6px", fontWeight: 400 }}>N · cm</span>
              </th>
              <th style={{ ...hdr, width: "5%" }}>1º+2º</th>
              <th style={{ ...hdr, width: "5%" }}>2º+3º</th>
            </tr>
          </thead>
          <tbody>
            {ord.map((l, i) => {
              const s12 = l.g1 + l.g2;
              const s23 = l.g2 + l.g3;
              const prev = i > 0 ? ord[i - 1] : null;
              const mudouCamada =
                i === 0 ||
                !prev ||
                l.solo !== prev.solo ||
                l.soloDetalhe !== prev.soloDetalhe;
              const naProfNum = Number(meta.naProfundidade);
              const marcaNA =
                Number.isFinite(naProfNum) &&
                Math.abs(naProfNum - l.prof) < 0.001;

              return (
                <tr key={`${l.prof}-${i}`}>
                  <td style={cell} />
                  <td
                    style={{
                      ...cell,
                      padding: 0,
                      backgroundColor: "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        minHeight: ROW_H,
                        height: ROW_H,
                        boxSizing: "border-box",
                        background: marcaNA
                          ? "linear-gradient(90deg, #2563eb 0%, #2563eb 45%, transparent 45%)"
                          : "transparent",
                      }}
                    />
                  </td>
                  <td style={cell}>{(l.avanco ?? "").trim() || "—"}</td>
                  <td style={cell}>{(l.reves ?? "").trim() || ""}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>
                    {l.prof.toFixed(2).replace(".", ",")}
                  </td>
                  <td style={cell}>{i}</td>
                  {celGolpesCm(cell, l.g1, cmIntervalo(l, 1))}
                  {celGolpesCm(cell, l.g2, cmIntervalo(l, 2))}
                  {celGolpesCm(cell, l.g3, cmIntervalo(l, 3))}
                  <td style={cell}>{s12}</td>
                  <td style={{ ...cell, fontWeight: 700 }}>{s23}</td>
                  {i === 0 ? (
                    <td
                      rowSpan={nLin}
                      style={{
                        ...cell,
                        padding: 0,
                        verticalAlign: "top",
                        height: "auto",
                      }}
                    >
                      <GraficoNspt
                        data={grafData}
                        width={wGraf}
                        height={hGraf}
                      />
                    </td>
                  ) : null}
                  <td style={{ ...cell, fontSize: "7px" }}>
                    {(l.consistencia ?? "").trim() || "—"}
                  </td>
                  <td style={cell}>
                    {mudouCamada && i > 0
                      ? l.prof.toFixed(2).replace(".", ",")
                      : ""}
                  </td>
                  <td
                    style={{
                      ...cell,
                      padding: 0,
                      verticalAlign: "top" as const,
                      textAlign: "left" as const,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "stretch",
                        minHeight: ROW_H,
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          flexShrink: 0,
                          backgroundColor: mudouCamada
                            ? corBarraMaterial(l)
                            : "#f1f5f9",
                          borderRight: "1px solid #d1d5db",
                        }}
                        title={l.solo || "Material"}
                      />
                      <div
                        style={{
                          flex: 1,
                          padding: "4px 6px",
                          fontSize: "7px",
                          lineHeight: 1.25,
                          color: "#000000",
                          backgroundColor: "#ffffff",
                        }}
                      >
                        {mudouCamada ? textoAmostra(l) : ""}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td
                colSpan={15}
                style={{
                  ...cell,
                  fontWeight: 700,
                  textAlign: "center",
                  verticalAlign: "middle",
                  padding: "8px 6px",
                }}
              >
                LIMITE DE SONDAGEM — profundidade final {profMax.toFixed(2)} m
                (NBR 6484:2020)
              </td>
            </tr>
          </tbody>
        </table>

        {meta.fotosCampo && meta.fotosCampo.length > 0 && (
          <RelatorioFotosPdfSection fotos={meta.fotosCampo} border={PDF_BORDER} />
        )}

        <div
          style={{
            marginTop: "8px",
            border: PDF_BORDER,
            padding: "6px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "6px",
            fontSize: "7px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ border: PDF_BORDER, padding: "6px", textAlign: "center" }}>
            <strong>NSPT (2º+3º)</strong>
            <br />
            Soma dos golpes nos 2 últimos intervalos de 15 cm (penetração padrão).
          </div>
          <div style={{ border: PDF_BORDER, padding: "6px", textAlign: "center" }}>
            <strong>Consistência / compactação</strong>
            <br />
            MM — muito mole · M — mole · R — rígido · MD — muito duro (exemplos).
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "8px",
            fontSize: "8px",
            borderTop: PDF_BORDER,
            paddingTop: "8px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div>{m.end}</div>
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
            }}
          >
            CONFORME NBR 6484:2020
          </div>
        </div>
      </div>
    );
  },
);

SptRelatorioSoilsulPdf.displayName = "SptRelatorioSoilsulPdf";
