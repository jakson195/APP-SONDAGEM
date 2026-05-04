"use client";

import type { CSSProperties } from "react";
import { forwardRef, useMemo } from "react";
import { RelatorioFotosPdfSection } from "@/components/relatorio-fotos-pdf-section";
import { SptPdfStaticMap } from "@/components/spt-pdf-static-map";

export type TradoLinhaPdf = {
  de: number;
  ate: number;
  /** Material classificado (lista CPRM / rotativa). */
  tipo?: string;
  cor?: string;
  descricao: string;
  obs?: string;
};

export type TradoMetaPdf = {
  furoCodigo?: string;
  cliente?: string;
  obra?: string;
  local?: string;
  ref?: string;
  dataInicio?: string;
  dataFim?: string;
  nivelAgua?: string;
  cotaBoca?: string;
  coordN?: string;
  coordE?: string;
  pagina?: number;
  totalPaginas?: number;
  responsavel?: string;
  endereco?: string;
  mapaLatitude?: number | null;
  mapaLongitude?: number | null;
  mapaZoom?: number;
  fotosCampo?: string[];
};

type Props = {
  linhas: TradoLinhaPdf[];
  meta: TradoMetaPdf;
};

export const TradoRelatorioPdf = forwardRef<HTMLDivElement, Props>(
  function TradoRelatorioPdf({ linhas, meta }, ref) {
    const m = useMemo(
      () => ({
        furo: meta.furoCodigo?.trim() || "—",
        cliente: meta.cliente?.trim() || "—",
        obra: meta.obra?.trim() || "—",
        local: meta.local?.trim() || "—",
        ref: meta.ref?.trim() || "—",
        d0: meta.dataInicio?.trim() || "—",
        d1: meta.dataFim?.trim() || "—",
        na: meta.nivelAgua?.trim() || "Não medido",
        cota: meta.cotaBoca?.trim() || "—",
        cn: meta.coordN?.trim() || "—",
        ce: meta.coordE?.trim() || "—",
        pg: meta.pagina ?? 1,
        tg: meta.totalPaginas ?? 1,
        resp: meta.responsavel?.trim() || "—",
        end:
          meta.endereco?.trim() || "Rua Flávio Pires, 131, Araranguá - SC",
      }),
      [meta],
    );

    const cell: CSSProperties = {
      border: "1px solid #000000",
      padding: "4px 5px",
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

    const profMax = useMemo(
      () => (linhas.length ? Math.max(...linhas.map((l) => l.ate)) : 0),
      [linhas],
    );

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
            <div
              style={{
                fontWeight: 800,
                fontSize: "14px",
                letterSpacing: "-0.5px",
              }}
            >
              SOILS
              <span style={{ fontWeight: 400 }}>UL</span>
            </div>
            <div style={{ textAlign: "center", flex: 1, padding: "0 8px" }}>
              <div style={{ fontWeight: 700, fontSize: "10px" }}>
                SOILSUL SONDAGENS E GEOTECNIA
              </div>
              <div style={{ fontSize: "8px", marginTop: "2px" }}>
                Sondagem de Simples Reconhecimento — Trado
              </div>
              <div style={{ fontSize: "7px", marginTop: "2px" }}>
                ABNT NBR 6484:2020 · NBR 6502:2022
              </div>
            </div>
            <div
              style={{ textAlign: "right", fontWeight: 700, fontSize: "10px" }}
            >
              {m.furo}
              <div style={{ fontSize: "8px", fontWeight: 400 }}>
                Pág. {m.pg}/{m.tg}
              </div>
            </div>
          </div>

          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "8px",
            }}
          >
            <tbody>
              <tr>
                <td style={{ ...cell, width: "14%", fontWeight: 700 }}>
                  Cliente
                </td>
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
                <td style={{ ...cell, fontWeight: 700 }}>Coord. (SIRGAS2000)</td>
                <td style={{ ...cell }} colSpan={5}>
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
              <th style={{ ...hdr, width: "8%" }} />
              <th style={{ ...hdr, width: "11%" }}>De (m)</th>
              <th style={{ ...hdr, width: "11%" }}>Até (m)</th>
              <th style={{ ...hdr, width: "22%" }}>Material</th>
              <th style={{ ...hdr, width: "28%" }}>Descrição</th>
              <th style={{ ...hdr, width: "20%" }}>Observações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td
                  style={{
                    ...cell,
                    padding: 0,
                    width: "8%",
                    backgroundColor: l.cor?.trim() || "#cccccc",
                  }}
                  title={l.tipo?.trim() || "—"}
                />
                <td style={{ ...cell, textAlign: "center" }}>
                  {l.de.toFixed(2)}
                </td>
                <td style={{ ...cell, textAlign: "center" }}>
                  {l.ate.toFixed(2)}
                </td>
                <td style={cell}>{l.tipo?.trim() || "—"}</td>
                <td style={cell}>{l.descricao?.trim() || "—"}</td>
                <td style={cell}>{l.obs?.trim() || "—"}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={6} style={{ ...cell, fontWeight: 700, textAlign: "center" }}>
                PROFUNDIDADE EXECUTADA — {profMax.toFixed(2)} m
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "10px",
            fontSize: "8px",
            borderTop: "1px solid #000000",
            paddingTop: "6px",
          }}
        >
          <div>
            <strong>Inclinação:</strong> 90° (vertical) — Trado manual
            <br />
            {m.end}
          </div>
          <div style={{ textAlign: "right" }}>
            <strong>Responsável técnico:</strong>
            <br />
            {m.resp}
          </div>
        </div>
      </div>
    );
  },
);

TradoRelatorioPdf.displayName = "TradoRelatorioPdf";
