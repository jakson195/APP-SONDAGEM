import type { SolodataLinhaRow, SolodataLinhaState } from "./solodata-linha-types";
import demoJson from "./solodata-linha12-demo.json";

type DemoFile = {
  sheetName: string;
  rows: SolodataLinhaRow[];
};

/** Dados da folha «LINHA 12» exportados de PLANILHA SOLODATA.xls. */
export function loadSolodataLinha12Demo(): SolodataLinhaState {
  const data = demoJson as DemoFile;
  const linha = data.sheetName.replace(/^LINHA\s*/i, "").trim() || "12";
  return {
    meta: { titulo: "Geofísica — (01)", linha },
    rows: data.rows.map((r) => ({ ...r })),
  };
}
