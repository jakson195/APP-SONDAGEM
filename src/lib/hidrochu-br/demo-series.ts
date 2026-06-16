import type { EstacaoBrasil, RegistroDiarioBr } from "./types";

/** PRNG determinístico por estação + dia (demo offline). */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand01(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function eachDay(dataInicio: string, dataFim: string): string[] {
  const out: string[] = [];
  const start = new Date(`${dataInicio}T12:00:00`);
  const end = new Date(`${dataFim}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cur = new Date(start);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Série pluviométrica sintética quando ANA/INMET estão indisponíveis. */
export function gerarSerieDemo(
  estacao: EstacaoBrasil,
  dataInicio: string,
  dataFim: string,
): RegistroDiarioBr[] {
  const dias = eachDay(dataInicio, dataFim);
  if (dias.length < 3) return [];

  const latFactor = Math.abs(estacao.latitude) / 30;
  const base = estacao.tipo === "Fluviometrica" ? 4 : 6 + latFactor * 2;

  return dias.map((data) => {
    const seed = hashSeed(`${estacao.codigo}:${data}`);
    const r = rand01(seed);
    const seasonal = 1 + 0.35 * Math.sin((new Date(data).getMonth() / 12) * Math.PI * 2);
    const event = r > 0.82 ? 15 + rand01(seed + 1) * 45 : 0;
    const mm = Math.round((base * seasonal * rand01(seed + 2) + event) * 10) / 10;

    return {
      codigo: estacao.codigo,
      data,
      precipitacaoMm: Math.max(0, mm),
    };
  });
}
