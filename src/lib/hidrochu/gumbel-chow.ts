import {
  assimetria,
  desvioPadrao,
  gumbelY,
  ksCritico5pct,
  media,
  momentosGumbel,
  quantilGumbelChow,
  regressaoLinear,
} from "@/lib/hidrochu/math-utils";
import type {
  GumbelChowFit,
  GumbelQuantileRow,
  HidroChuDuracaoInput,
} from "@/lib/hidrochu/types";
import { PERIODOS_RETORNO } from "@/lib/hidrochu/types";

function plottingPosition(i: number, n: number): number {
  return (i - 0.44) / (n + 0.12);
}

function fitFromSeries(valores: number[]): GumbelChowFit {
  const sorted = [...valores].filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  const m = media(sorted);
  const s = desvioPadrao(sorted);
  const sk = assimetria(sorted);

  const ys: number[] = [];
  for (let i = 1; i <= n; i++) {
    const F = plottingPosition(i, n);
    ys.push(-Math.log(-Math.log(F)));
  }
  const yn = media(ys);
  const sn = desvioPadrao(ys);

  const { slope, intercept } = regressaoLinear(ys, sorted);
  const alpha = slope > 1e-12 ? 1 / slope : 0;
  const beta = intercept;

  let ksDMax: number | null = null;
  if (n >= 3 && alpha > 0) {
    let dMax = 0;
    for (let i = 0; i < n; i++) {
      const Femp = (i + 1) / n;
      const x = sorted[i];
      const Ftheo = Math.exp(-Math.exp(-alpha * (x - beta)));
      const d = Math.abs(Femp - Ftheo);
      if (d > dMax) dMax = d;
    }
    ksDMax = dMax;
  }

  const ksDCritico = ksCritico5pct(n);
  return {
    alpha,
    beta,
    yn,
    sn,
    n,
    media: m,
    desvio: s,
    assimetria: sk,
    maior: sorted[n - 1] ?? 0,
    menor: sorted[0] ?? 0,
    ksDMax,
    ksDCritico,
    ksOk: ksDMax != null ? ksDMax <= ksDCritico : null,
  };
}

function fitFromMoments(input: HidroChuDuracaoInput): GumbelChowFit {
  const m = input.media ?? 0;
  const s = input.desvio ?? 0;
  const { alpha, beta } = momentosGumbel(m, s);
  const n = Math.max(1, Math.round((input.valores?.length ?? 0) || 30));
  return {
    alpha,
    beta,
    yn: 0.54,
    sn: 1.12,
    n,
    media: m,
    desvio: s,
    assimetria: input.assimetria ?? 0,
    maior: input.maior ?? m,
    menor: input.menor ?? m,
    ksDMax: null,
    ksDCritico: ksCritico5pct(n),
    ksOk: null,
  };
}

export function ajustarGumbelChow(input: HidroChuDuracaoInput): GumbelChowFit {
  const vals = input.valores?.filter((v) => Number.isFinite(v) && v > 0) ?? [];
  if (vals.length >= 3) {
    const fit = fitFromSeries(vals);
    if (input.media != null) fit.media = input.media;
    if (input.desvio != null) fit.desvio = input.desvio;
    return fit;
  }
  if (input.media != null && input.desvio != null && input.desvio > 0) {
    return fitFromMoments(input);
  }
  throw new Error("Informe a série de máximas anuais (≥3 valores) ou média e desvio.");
}

export function tabelaQuantis(fit: GumbelChowFit): GumbelQuantileRow[] {
  return PERIODOS_RETORNO.map((T) => {
    const pGe = 1 - 1 / T;
    const pLe = 1 / T;
    const y = gumbelY(T);
    const x = quantilGumbelChow(fit.beta, fit.alpha, T);
    return { T, y, x, pLe, pGe };
  });
}

export function estatisticasDeSerie(valores: number[]): {
  media: number;
  desvio: number;
  assimetria: number;
  maior: number;
  menor: number;
  n: number;
} {
  const v = valores.filter((x) => Number.isFinite(x) && x > 0);
  const sorted = [...v].sort((a, b) => a - b);
  return {
    media: media(v),
    desvio: desvioPadrao(v),
    assimetria: assimetria(v),
    maior: sorted[sorted.length - 1] ?? 0,
    menor: sorted[0] ?? 0,
    n: v.length,
  };
}
