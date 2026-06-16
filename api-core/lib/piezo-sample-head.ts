/**
 * Extrai carga hidráulica (cota piezométrica em m) a partir de `dadosCampo` do piezo.
 * Regra: carga = cota da boca (m) − profundidade do nível d'água (m).
 * Profundidade: última leitura com "Nível (m)" preenchido, ou Nₐ do boletim (`nivelAgua`).
 */

export function parseNumBr(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type PiezoHeadSample = {
  headM: number;
  cotaBocaM: number;
  depthM: number;
  fonte: "leitura" | "nivelAgua";
};

export function samplePiezoHeadM(dadosCampo: unknown): PiezoHeadSample | null {
  if (dadosCampo == null || typeof dadosCampo !== "object") return null;
  const o = dadosCampo as Record<string, unknown>;
  const cotaBocaM = parseNumBr(typeof o.cotaBoca === "string" ? o.cotaBoca : "");
  if (cotaBocaM == null) return null;

  const nivelAguaM = parseNumBr(typeof o.nivelAgua === "string" ? o.nivelAgua : "");

  let depthM: number | null = null;
  let fonte: PiezoHeadSample["fonte"] = "nivelAgua";

  if (Array.isArray(o.leituras)) {
    for (let i = o.leituras.length - 1; i >= 0; i -= 1) {
      const row = o.leituras[i];
      if (row == null || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const n = parseNumBr(typeof r.nivel === "string" ? r.nivel : "");
      if (n != null) {
        depthM = n;
        fonte = "leitura";
        break;
      }
    }
  }

  if (depthM == null && nivelAguaM != null) {
    depthM = nivelAguaM;
    fonte = "nivelAgua";
  }

  if (depthM == null) return null;

  const headM = cotaBocaM - depthM;
  return { headM, cotaBocaM, depthM, fonte };
}
