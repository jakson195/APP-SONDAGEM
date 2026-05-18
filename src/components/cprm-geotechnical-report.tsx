"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { CprmAlignedFigure } from "@/components/cprm-aligned-figure";
import { maxSampleDepthFromReadings } from "@/components/vertical-soil-profile";
import {
  CPRM_SOIL_FILL,
  CPRM_SOIL_STROKE,
  cprmSoilInk,
} from "@/lib/cprm-soil-palette";
import { classifySoilMaterial, SOIL_MATERIAL_LABEL, SOIL_MATERIAL_ORDER } from "@/lib/soil-type";
import { computeNspt } from "@/lib/spt";
import type { SptReading } from "@/lib/types";

export type CprmGeotechnicalReportProps = {
  projectName: string;
  projectLocation: string;
  clientName: string;
  boreholeId: string;
  totalDepthM: number;
  coordinateX: number;
  coordinateY: number;
  readings: SptReading[];
  showPrintButton?: boolean;
};

function CprmReadingsTable({ readings }: { readings: SptReading[] }) {
  const rows = [...readings].sort((a, b) => a.depthM - b.depthM);
  return (
    <div className="overflow-x-auto">
      <table className="cprm-data-table w-full min-w-[400px] border-collapse border border-black text-[10px] leading-tight text-black print:text-[9px]">
        <thead>
          <tr>
            <th className="border border-black bg-white px-2 py-1.5 text-left font-semibold">
              Profundidade (m)
            </th>
            <th className="border border-black bg-white px-2 py-1.5 text-center font-semibold">
              NSPT
            </th>
            <th className="border border-black bg-white px-2 py-1.5 text-left font-semibold">
              Descrição do solo
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const kind = classifySoilMaterial(r.soilDescription);
            const ink = cprmSoilInk(kind);
            return (
              <tr
                key={i}
                style={{
                  backgroundColor: CPRM_SOIL_FILL[kind],
                  color: ink,
                }}
              >
                <td className="border border-black px-2 py-1 tabular-nums">
                  {Number.isFinite(r.depthM) ? r.depthM : "—"}
                </td>
                <td className="border border-black px-2 py-1 text-center font-semibold tabular-nums">
                  {computeNspt(r.n2, r.n3)}
                </td>
                <td className="border border-black px-2 py-1">
                  {r.soilDescription.trim() || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CprmMaterialLegend() {
  return (
    <div
      className="border border-black bg-white px-2 py-2 text-[8px] text-black sm:text-[9px] print:py-1.5"
      aria-label="Legenda de materiais (padrão CPRM aproximado)"
    >
      <p className="mb-1.5 font-semibold uppercase tracking-wide">Legenda — materiais</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {SOIL_MATERIAL_ORDER.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-4 shrink-0 border"
              style={{
                backgroundColor: CPRM_SOIL_FILL[k],
                borderColor: CPRM_SOIL_STROKE[k],
              }}
              aria-hidden
            />
            <span>{SOIL_MATERIAL_LABEL[k]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Printable A4-style geotechnical record: aligned depth scale, colored profile, NSPT plot,
 * and summary table. White background, thin black rules, CPRM-inspired material colors.
 */
export function CprmGeotechnicalReport({
  projectName,
  projectLocation,
  clientName,
  boreholeId,
  totalDepthM,
  coordinateX,
  coordinateY,
  readings,
  showPrintButton = true,
}: CprmGeotechnicalReportProps) {
  const chartDepth = Math.max(
    totalDepthM,
    maxSampleDepthFromReadings(readings),
    0.1,
  );

  const [issued, setIssued] = useState("");

  useEffect(() => {
    setIssued(
      new Date().toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    );
  }, []);

  return (
    <article className="cprm-geotechnical-report mx-auto max-w-[210mm] bg-white text-black print:max-w-none">
      {showPrintButton && (
        <div className="mb-3 flex justify-end print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-md border border-black bg-white px-3 py-2 text-sm font-medium text-black shadow-sm hover:bg-neutral-50"
          >
            <Printer className="h-4 w-4" aria-hidden />
            Imprimir relatório (A4)
          </button>
        </div>
      )}

      <div className="border border-black bg-white print:border-black print:shadow-none">
        <header className="border-b border-black px-3 py-3 print:px-3 print:py-2">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-black">
            Registro geotécnico — sondagem a percussão (SPT)
          </p>
          <h2 className="mt-1 text-sm font-bold tracking-tight sm:text-base print:text-sm">
            Furo {boreholeId}
          </h2>
          <table className="mt-3 w-full border-collapse text-[9px] sm:text-[10px] print:mt-2 print:text-[9px]">
            <tbody>
              <tr>
                <td className="w-[28%] border border-black bg-white py-1 pl-1.5 pr-1 font-semibold">
                  Obra / projeto
                </td>
                <td className="border border-black py-1 pl-1.5" colSpan={3}>
                  {projectName}
                </td>
              </tr>
              <tr>
                <td className="border border-black py-1 pl-1.5 pr-1 font-semibold">Local</td>
                <td className="border border-black py-1 pl-1.5" colSpan={3}>
                  {projectLocation}
                </td>
              </tr>
              <tr>
                <td className="border border-black py-1 pl-1.5 pr-1 font-semibold">Cliente</td>
                <td className="border border-black py-1 pl-1.5" colSpan={3}>
                  {clientName}
                </td>
              </tr>
              <tr>
                <td className="border border-black py-1 pl-1.5 pr-1 font-semibold">
                  Cota final (m)
                </td>
                <td className="border border-black py-1 pl-1.5 tabular-nums">
                  {totalDepthM}
                </td>
                <td className="w-[22%] border border-black py-1 pl-1.5 pr-1 font-semibold">
                  Coordenadas X / Y
                </td>
                <td className="border border-black py-1 pl-1.5 tabular-nums">
                  {coordinateX} / {coordinateY}
                </td>
              </tr>
              <tr>
                <td className="border border-black py-1 pl-1.5 pr-1 font-semibold">
                  Data de emissão
                </td>
                <td className="border border-black py-1 pl-1.5 tabular-nums" colSpan={3}>
                  {issued || "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </header>

        <section className="border-b border-black px-2 py-2 print:px-2 print:py-1.5">
          <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide print:mb-1 print:text-[9px]">
            Perfil geotécnico e gráfico NSPT
          </h3>
          <CprmMaterialLegend />
          <div className="mt-2 break-inside-avoid print:mt-1.5">
            <CprmAlignedFigure readings={readings} maxDepthM={chartDepth} />
          </div>
        </section>

        <section className="px-2 py-2 print:px-2 print:py-1.5">
          <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide print:mb-1 print:text-[9px]">
            Quadro de ensaios SPT
          </h3>
          {readings.length === 0 ? (
            <p className="text-[9px] text-black">Nenhuma leitura informada.</p>
          ) : (
            <CprmReadingsTable readings={readings} />
          )}
        </section>

        <footer className="border-t border-black px-2 py-1.5 text-[7px] leading-snug text-black print:text-[6.5px]">
          <p>
            Gráfico: eixo vertical = profundidade (m), profundidade aumenta para baixo. Coluna
            colorida: interpretação do traço a partir das descrições de campo. Cores de legenda
            no padrão usual de relatórios geológicos (referência aproximada estilo CPRM / serviço
            geológico). Valores N (SPT) conforme amostras informadas.
          </p>
        </footer>
      </div>
    </article>
  );
}
