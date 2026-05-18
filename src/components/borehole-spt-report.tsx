"use client";

import { Printer } from "lucide-react";
import { SptProfileChart } from "@/components/spt-profile-chart";
import {
  maxSampleDepthFromReadings,
  VerticalSoilProfile,
} from "@/components/vertical-soil-profile";
import {
  classifySoilMaterial,
  SOIL_MATERIAL_FILL,
  soilMaterialInk,
} from "@/lib/soil-type";
import { computeNspt } from "@/lib/spt";
import type { SptReading } from "@/lib/types";

export type BoreholeSptReportProps = {
  projectName: string;
  projectLocation: string;
  clientName: string;
  boreholeId: string;
  totalDepthM: number;
  coordinateX: number;
  coordinateY: number;
  readings: SptReading[];
  compact?: boolean;
  /** Show “Print report” (hidden automatically when printing). */
  showPrintButton?: boolean;
};

function SptReadingsTable({ readings }: { readings: SptReading[] }) {
  const rows = [...readings].sort((a, b) => a.depthM - b.depthM);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse border border-neutral-900 text-[11px] leading-tight print:text-[10px]">
        <thead>
          <tr className="bg-neutral-100">
            <th className="border border-neutral-900 px-2 py-1.5 text-left font-semibold">
              Depth (m)
            </th>
            <th className="border border-neutral-900 px-2 py-1.5 text-center font-semibold">
              N1
            </th>
            <th className="border border-neutral-900 px-2 py-1.5 text-center font-semibold">
              N2
            </th>
            <th className="border border-neutral-900 px-2 py-1.5 text-center font-semibold">
              N3
            </th>
            <th className="border border-neutral-900 px-2 py-1.5 text-center font-semibold">
              NSPT
            </th>
            <th className="border border-neutral-900 px-2 py-1.5 text-left font-semibold">
              Soil description
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const kind = classifySoilMaterial(r.soilDescription);
            const ink = soilMaterialInk(kind);
            return (
              <tr
                key={i}
                style={{
                  backgroundColor: SOIL_MATERIAL_FILL[kind],
                  color: ink,
                }}
              >
                <td className="border border-neutral-900 px-2 py-1 tabular-nums">
                  {Number.isFinite(r.depthM) ? r.depthM : "—"}
                </td>
                <td className="border border-neutral-900 px-2 py-1 text-center tabular-nums">
                  {r.n1}
                </td>
                <td className="border border-neutral-900 px-2 py-1 text-center tabular-nums">
                  {r.n2}
                </td>
                <td className="border border-neutral-900 px-2 py-1 text-center tabular-nums">
                  {r.n3}
                </td>
                <td className="border border-neutral-900 px-2 py-1 text-center font-semibold tabular-nums">
                  {computeNspt(r.n2, r.n3)}
                </td>
                <td className="border border-neutral-900 px-2 py-1 font-medium">
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

export function BoreholeSptReport({
  projectName,
  projectLocation,
  clientName,
  boreholeId,
  totalDepthM,
  coordinateX,
  coordinateY,
  readings,
  compact = false,
  showPrintButton = true,
}: BoreholeSptReportProps) {
  const chartDepth = Math.max(
    totalDepthM,
    maxSampleDepthFromReadings(readings),
    0.1,
  );

  const generated = new Date();

  return (
    <article className="borehole-spt-report mx-auto max-w-6xl bg-white text-neutral-900 print:max-w-none">
      {showPrintButton && (
        <div className="mb-4 flex justify-end print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-400 bg-white px-3 py-2 text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50"
          >
            <Printer className="h-4 w-4" aria-hidden />
            Print report
          </button>
        </div>
      )}

      <div className="rounded-xl border-2 border-neutral-900 bg-white p-4 shadow-sm print:rounded-none print:border-2 print:p-3 print:shadow-none">
        <header className="border-b-2 border-neutral-900 pb-4 print:pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600 print:text-[9px]">
            Geotechnical record
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-neutral-900 print:text-base">
            Borehole — SPT & soil profile
          </h2>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 print:mt-3 print:gap-y-1 print:text-[10px]">
            <div className="flex gap-2">
              <dt className="min-w-[5rem] font-semibold text-neutral-600">Project</dt>
              <dd>{projectName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="min-w-[5rem] font-semibold text-neutral-600">Location</dt>
              <dd>{projectLocation}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="min-w-[5rem] font-semibold text-neutral-600">Client</dt>
              <dd>{clientName}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="min-w-[5rem] font-semibold text-neutral-600">Borehole ID</dt>
              <dd className="font-semibold">{boreholeId}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="min-w-[5rem] font-semibold text-neutral-600">Total depth (m)</dt>
              <dd className="tabular-nums">{totalDepthM}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="min-w-[5rem] font-semibold text-neutral-600">Coordinates X / Y</dt>
              <dd className="tabular-nums">
                {coordinateX} / {coordinateY}
              </dd>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <dt className="min-w-[5rem] font-semibold text-neutral-600">Generated</dt>
              <dd className="tabular-nums">
                {generated.toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </dd>
            </div>
          </dl>
        </header>

        <section className="mt-6 break-inside-avoid print:mt-4">
          <h3 className="mb-2 border-b border-neutral-900 pb-1 text-xs font-bold uppercase tracking-wide text-neutral-900 print:text-[11px]">
            1. SPT field readings
          </h3>
          {readings.length === 0 ? (
            <p className="text-xs text-neutral-600">No rows entered.</p>
          ) : (
            <SptReadingsTable readings={readings} />
          )}
        </section>

        <section className="mt-8 break-inside-avoid print:mt-6">
          <h3 className="mb-2 border-b border-neutral-900 pb-1 text-xs font-bold uppercase tracking-wide text-neutral-900 print:text-[11px]">
            2. NSPT vs depth & soil description column
          </h3>
          <div className="print:break-inside-avoid">
            <SptProfileChart
              readings={readings}
              maxDepthM={chartDepth}
              compact={compact}
              title="SPT profile chart"
              className="border-neutral-900 print:border"
            />
          </div>
        </section>

        <section className="mt-8 break-inside-avoid print:mt-6">
          <h3 className="mb-2 border-b border-neutral-900 pb-1 text-xs font-bold uppercase tracking-wide text-neutral-900 print:text-[11px]">
            3. Stratigraphic soil profile
          </h3>
          <div className="print:break-inside-avoid">
            <VerticalSoilProfile
              readings={readings}
              boreholeDepthM={chartDepth}
              compact={compact}
              title="Vertical soil profile"
              className="border-neutral-900 print:border"
            />
          </div>
        </section>
      </div>
    </article>
  );
}
