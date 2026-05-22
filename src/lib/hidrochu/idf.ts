/** i = K·T^m / (t+b)^n — equação IDF (HidroChuSC). */
export type CoefIdf = { K: number; m: number; b: number; n: number; limiteMin: number };

export const IDF_PADRAO_CURTA: CoefIdf = {
  K: 944.88,
  m: 0.192,
  b: 8.92,
  n: 0.698,
  limiteMin: 120,
};

export const IDF_PADRAO_LONGA: CoefIdf = {
  K: 1380.95,
  m: 0.192,
  b: 11.68,
  n: 0.773,
  limiteMin: 1440,
};

export function intensidadeIdf(
  c: CoefIdf,
  periodoRetorno: number,
  duracaoMin: number,
): number {
  if (duracaoMin <= 0 || periodoRetorno <= 0) return 0;
  return (c.K * periodoRetorno ** c.m) / (duracaoMin + c.b) ** c.n;
}

export function alturaIdf(iMmH: number, duracaoMin: number): number {
  return (iMmH * duracaoMin) / 60;
}
