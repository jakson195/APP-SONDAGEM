/** Colormap para diferença entre duas épocas (B − A), mm. */

export function diffToRgba(
  deltaMm: number,
  nodata: number | null,
  maxAbsMm = 20,
  alpha = 220,
): [number, number, number, number] {
  if (!Number.isFinite(deltaMm)) return [0, 0, 0, 0];
  if (nodata != null && Math.abs(deltaMm - nodata) < 1e-6) return [0, 0, 0, 0];

  const t = Math.max(-1, Math.min(1, deltaMm / maxAbsMm));
  if (Math.abs(t) < 0.08) {
    return [200, 200, 200, Math.round(alpha * 0.5)];
  }
  if (t > 0) {
    const u = t;
    return [
      Math.round(250 + u * (239 - 250)),
      Math.round(204 - u * 160),
      Math.round(21 + u * (68 - 21)),
      alpha,
    ];
  }
  const u = -t;
  return [
    Math.round(21 + u * (59 - 21)),
    Math.round(128 + u * (130 - 128)),
    Math.round(246 - u * 80),
    alpha,
  ];
}

export function applyDiffColormap(
  delta: Float32Array,
  width: number,
  height: number,
  nodata: number | null,
  maxAbsMm = 20,
): ImageData {
  const imageData = new ImageData(width, height);
  const px = imageData.data;
  for (let i = 0; i < delta.length; i++) {
    const [r, g, b, a] = diffToRgba(delta[i], nodata, maxAbsMm);
    const o = i * 4;
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = b;
    px[o + 3] = a;
  }
  return imageData;
}

export function computeDeltaRaster(
  valuesA: Float32Array,
  valuesB: Float32Array,
  nodata: number | null,
): Float32Array {
  const out = new Float32Array(valuesA.length);
  for (let i = 0; i < valuesA.length; i++) {
    const a = valuesA[i];
    const b = valuesB[i];
    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      (nodata != null && (a === nodata || b === nodata))
    ) {
      out[i] = nodata ?? NaN;
    } else {
      out[i] = b - a;
    }
  }
  return out;
}
