import type { EstacaoBrasil, FonteHidrologica, RegistroDiarioBr } from "./types";

export type AutoImportResponse = {
  ok: boolean;
  fonteUsada: string;
  registros: RegistroDiarioBr[];
  total: number;
  maximasAnuais: { ano: number; maxMm: number }[];
  avisos: string[];
  periodo?: { dataInicio: string; dataFim: string };
  error?: string;
};

/** Importação automática via API (ANA / INMET com fallback). */
export async function autoImportFromFonte(opts: {
  estacao: EstacaoBrasil;
  fonte?: FonteHidrologica;
  dataInicio: string;
  dataFim: string;
}): Promise<AutoImportResponse> {
  const res = await fetch("/api/hidrochu-br/import/auto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = (await res.json()) as AutoImportResponse & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Importação automática falhou");
  return data;
}
