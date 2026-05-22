const MESES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Maio",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export type MesOcorrenciaRow = {
  mes: string;
  n: number;
  freqPct: number;
};

/** Qui-quadrado (11 gl) vs uniforme — aproximação HidroChuSC. */
export function analiseMesOcorrencia(contagens: number[]): {
  linhas: MesOcorrenciaRow[];
  freqEsperada: number;
  quiCalc: number;
  quiTab: number;
  pValor: number;
} {
  const n = MESES.length;
  const total = contagens.reduce((a, b) => a + b, 0) || 1;
  const esperada = total / n;
  let qui = 0;
  for (const o of contagens) {
    const diff = o - esperada;
    qui += (diff * diff) / esperada;
  }
  const linhas = MESES.map((mes, i) => ({
    mes,
    n: contagens[i] ?? 0,
    freqPct: ((contagens[i] ?? 0) / total) * 100,
  }));
  return {
    linhas,
    freqEsperada: esperada,
    quiCalc: qui,
    quiTab: 19.68,
    pValor: Math.max(0, 1 - qui / 30),
  };
}

export { MESES };
