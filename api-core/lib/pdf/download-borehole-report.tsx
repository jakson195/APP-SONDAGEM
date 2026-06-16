"use client";

import { pdf } from "@react-pdf/renderer";
import { BoreholeReportDocument } from "@/lib/pdf/borehole-report-document";
import type { BoreholeInput, Project } from "@/lib/types";

export async function downloadBoreholeReportPdf(
  borehole: BoreholeInput,
  project: Project,
): Promise<void> {
  const blob = await pdf(
    <BoreholeReportDocument
      borehole={borehole}
      project={project}
      generatedAt={new Date()}
    />,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = borehole.boreholeId.replace(/[^\w.-]+/g, "_");
  a.download = `borehole-${safe}-report.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
