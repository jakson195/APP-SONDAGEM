const EULER = 0.5772156649015329;

export function media(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function desvioPadrao(vals: number[]): number {
  if (vals.length < 2) return 0;
  const m = media(vals);
  const v = vals.reduce((s, x) => s + (x - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(v);
}

export function assimetria(vals: number[]): number {
  if (vals.length < 3) return 0;
  const m = media(vals);
  const s = desvioPadrao(vals);
  if (s < 1e-12) return 0;
  const n = vals.length;
  const sum3 = vals.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * sum3;
}

/** Regressão linear y = intercept + slope * x */
export function regressaoLinear(
  x: number[],
  y: number[],
): { slope: number; intercept: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0 };
  const mx = media(x);
  const my = media(y);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  const slope = den < 1e-12 ? 0 : num / den;
  const intercept = my - slope * mx;
  return { slope, intercept };
}

export function gumbelY(periodoRetorno: number): number {
  const F = 1 - 1 / periodoRetorno;
  return -Math.log(-Math.log(F));
}

export function quantilGumbelChow(
  beta: number,
  alpha: number,
  periodoRetorno: number,
): number {
  return beta + (1 / alpha) * gumbelY(periodoRetorno);
}

/** Ajuste Gumbel-Chow (Chow / posição de plotting). */
export function momentosGumbel(mediaObs: number, desvioObs: number): {
  alpha: number;
  beta: number;
} {
  const sigma = (desvioObs * Math.PI) / Math.sqrt(6);
  const alpha = sigma > 1e-12 ? 1 / sigma : 0;
  const beta = mediaObs - EULER * sigma;
  return { alpha, beta };
}

export function ksCritico5pct(n: number): number {
  if (n < 2) return 1;
  return 1.22 / Math.sqrt(n) + 0.2 / n;
}
