import type { RegistroDiarioBr } from "./types";

function parseNum(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

/** Normaliza data ISO ou DD/MM/YYYY. */
function parseData(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const dd = m[1]!.padStart(2, "0");
    const mm = m[2]!.padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

/**
 * CSV/TSV exportado do HidroWeb ou planilha ANA.
 * Colunas flexíveis: data + chuva/precipitação/cota/vazão.
 */
export function parseAnaCsv(
  text: string,
  codigoEstacao: string,
): RegistroDiarioBr[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const sep = lines[0]!.includes("\t")
    ? "\t"
    : lines[0]!.includes(";")
      ? ";"
      : ",";
  const header = lines[0]!.toLowerCase().split(sep).map((h) => h.trim());

  const iData = header.findIndex((h) =>
    ["data", "date", "dia", "datamedicao", "data_medicao"].some((k) =>
      h.includes(k),
    ),
  );
  const iChuva = header.findIndex((h) =>
    ["chuva", "precip", "precipitacao", "mm", "valor"].some((k) => h.includes(k)),
  );
  const iCota = header.findIndex((h) => h.includes("cota"));
  const iVazao = header.findIndex((h) =>
    h.includes("vazao") || h.includes("vazão"),
  );

  const out: RegistroDiarioBr[] = [];
  const start = iData >= 0 ? 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const cols = lines[i]!.split(sep).map((c) => c.trim());
    let data: string | null;
    let precip = 0;
    let cota: number | undefined;
    let vazao: number | undefined;

    if (iData >= 0) {
      data = parseData(cols[iData] ?? "");
      precip = parseNum(cols[iChuva >= 0 ? iChuva : 1] ?? "") ?? 0;
      if (iCota >= 0) cota = parseNum(cols[iCota] ?? "") ?? undefined;
      if (iVazao >= 0) vazao = parseNum(cols[iVazao] ?? "") ?? undefined;
    } else {
      data = parseData(cols[0] ?? "");
      precip = parseNum(cols[1] ?? "") ?? 0;
      if (cols[2]) cota = parseNum(cols[2] ?? "") ?? undefined;
    }

    if (!data) continue;
    out.push({
      codigo: codigoEstacao,
      data,
      precipitacaoMm: Math.max(0, precip),
      cotaM: cota,
      vazaoM3s: vazao,
    });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}
