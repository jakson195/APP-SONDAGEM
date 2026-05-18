/**
 * Tenta obter limites WGS84 (graus) embutidos em PDF georreferenciado (GeoPDF /
 * ISO 32000 Measure, OGC em XML, ou anotações expostas pelo pdf.js).
 * Nem todos os PDFs do QGIS incluem estes dados em texto claro (object streams
 * comprimidos podem esconder /GPTS).
 */

export type Wgs84Bounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

const MAX_PDF_SCAN_BYTES = 28 * 1024 * 1024;

export function isValidWgsBox(b: Wgs84Bounds): boolean {
  const { south, west, north, east } = b;
  if (![south, west, north, east].every((n) => Number.isFinite(n))) return false;
  if (Math.abs(south) > 90 || Math.abs(north) > 90) return false;
  if (Math.abs(west) > 180 || Math.abs(east) > 180) return false;
  if (north - south > 170 || east - west > 350) return false;
  return true;
}

/** Pares (lon, lat) vs (lat, lon); escolhe a interpretação que cabe em WGS84. */
export function boundsFromGptsNumberArray(nums: number[]): Wgs84Bounds | null {
  if (nums.length < 4 || nums.length % 2 !== 0) return null;

  const asLonLat: Wgs84Bounds = (() => {
    let minLon = 180,
      maxLon = -180,
      minLat = 90,
      maxLat = -90;
    for (let i = 0; i < nums.length; i += 2) {
      const lon = nums[i]!;
      const lat = nums[i + 1]!;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    return { west: minLon, east: maxLon, south: minLat, north: maxLat };
  })();

  const asLatLon: Wgs84Bounds = (() => {
    let minLon = 180,
      maxLon = -180,
      minLat = 90,
      maxLat = -90;
    for (let i = 0; i < nums.length; i += 2) {
      const lat = nums[i]!;
      const lon = nums[i + 1]!;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    return { west: minLon, east: maxLon, south: minLat, north: maxLat };
  })();

  const okLonLat = isValidWgsBox(asLonLat);
  const okLatLon = isValidWgsBox(asLatLon);
  if (okLonLat && !okLatLon) return asLonLat;
  if (okLatLon && !okLonLat) return asLatLon;
  if (okLonLat && okLatLon) return asLonLat;
  return null;
}

/**
 * Quando `/GPTS` foi interpretado como lon,lat mas o PDF (ex.: QGIS) gravou lat,lon,
 * o retângulo fica com «latitude» e «longitude» trocadas. Esta permuta reconstrói o
 * retângulo WGS84 habitual (sul/norte = lat, oeste/leste = lon).
 */
export function transposeMisreadLatLonBox(b: Wgs84Bounds): Wgs84Bounds {
  return {
    south: b.west,
    north: b.east,
    west: b.south,
    east: b.north,
  };
}

/**
 * Corrige leituras `/GPTS` em que o primeiro número de cada par é latitude (ex.: QGIS)
 * mas `boundsFromGptsNumberArray` escolheu lon,lat por ser também válido em WGS84.
 * Heurística: faixa típica Sul/Sudeste do Brasil (lat ~-23…-34, lon ~-34…-54).
 */
export function maybeTransposeMisreadGptsBounds(b: Wgs84Bounds): Wgs84Bounds {
  const midWrongLat = (b.south + b.north) / 2;
  const midWrongLon = (b.west + b.east) / 2;
  const dLat = Math.abs(b.north - b.south);
  const dLon = Math.abs(b.east - b.west);
  const t = transposeMisreadLatLonBox(b);
  if (!isValidWgsBox(t)) return b;
  if (dLat > 0.35 || dLon > 0.35) return b;
  if (
    midWrongLat < -32 &&
    midWrongLat > -56 &&
    midWrongLon < -20 &&
    midWrongLon > -36
  ) {
    return t;
  }
  return b;
}

function parseFloatsFromBracketContent(inner: string): number[] {
  return inner
    .trim()
    .split(/[\s,]+/)
    .map((s) => Number.parseFloat(s))
    .filter((n) => Number.isFinite(n));
}

/** Procura `/GPTS [ ... ]` no PDF em texto (Latin-1). */
export function scanPdfBytesForGptsBounds(bytes: Uint8Array): Wgs84Bounds | null {
  const n = Math.min(bytes.length, MAX_PDF_SCAN_BYTES);
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, n));
  const re = /\/GPTS\s*\[([^\]]+)\]/gi;
  let best: Wgs84Bounds | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const nums = parseFloatsFromBracketContent(m[1]!);
    const b = boundsFromGptsNumberArray(nums);
    if (b) {
      if (!best) best = b;
      else {
        best = {
          south: Math.min(best.south, b.south),
          west: Math.min(best.west, b.west),
          north: Math.max(best.north, b.north),
          east: Math.max(best.east, b.east),
        };
      }
    }
  }
  return best;
}

/** OGC / GML em XML por vezes embutido no PDF. */
export function scanPdfBytesForOgcGmlBounds(bytes: Uint8Array): Wgs84Bounds | null {
  const n = Math.min(bytes.length, MAX_PDF_SCAN_BYTES);
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, n));
  const lower =
    text.match(/<(?:[^:>]+:)?LowerCorner[^>]*>([^<]+)</i) ||
    text.match(/ows:LowerCorner[^>]*>([^<]+)</i);
  const upper =
    text.match(/<(?:[^:>]+:)?UpperCorner[^>]*>([^<]+)</i) ||
    text.match(/ows:UpperCorner[^>]*>([^<]+)</i);
  if (!lower || !upper) return null;
  const lc = lower[1]!.trim().split(/\s+/).map(Number);
  const uc = upper[1]!.trim().split(/\s+/).map(Number);
  if (lc.length < 2 || uc.length < 2) return null;
  const x1 = lc[0]!,
    y1 = lc[1]!,
    x2 = uc[0]!,
    y2 = uc[1]!;
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  const tryLonLat: Wgs84Bounds = {
    west: Math.min(x1, x2),
    east: Math.max(x1, x2),
    south: Math.min(y1, y2),
    north: Math.max(y1, y2),
  };
  if (isValidWgsBox(tryLonLat)) return tryLonLat;
  const tryLatLon: Wgs84Bounds = {
    west: Math.min(y1, y2),
    east: Math.max(y1, y2),
    south: Math.min(x1, x2),
    north: Math.max(x1, x2),
  };
  if (isValidWgsBox(tryLatLon)) return tryLatLon;
  return null;
}

function extractGptsFromJsonish(s: string): Wgs84Bounds | null {
  const m =
    s.match(/"GPTS"\s*:\s*\[([\d\s,.eE+\-]+)\]/) ||
    s.match(/"GPTS"\s*:\s*\[([^\]]+)\]/);
  if (!m) return null;
  const nums = parseFloatsFromBracketContent(m[1]!);
  return boundsFromGptsNumberArray(nums);
}

/** Metadados XMP / objeto serializado. */
export async function extractBoundsFromPdfJsMetadata(
  pdf: { getMetadata: () => Promise<{ metadata?: { getRaw?: () => unknown } | null }> },
): Promise<Wgs84Bounds | null> {
  try {
    const { metadata } = await pdf.getMetadata();
    const raw = metadata?.getRaw?.();
    const str =
      typeof raw === "string"
        ? raw
        : raw != null
          ? JSON.stringify(raw)
          : "";
    if (!str || str.length < 20) return null;
    return (
      scanPdfBytesForOgcGmlBounds(new TextEncoder().encode(str)) ??
      extractGptsFromJsonish(str)
    );
  } catch {
    return null;
  }
}

export async function extractBoundsFromPdfPageAnnotations(pdf: {
  getPage: (n: number) => Promise<unknown>;
}): Promise<Wgs84Bounds | null> {
  try {
    const page = await pdf.getPage(1);
    const p = page as {
      getAnnotations?: (o?: object) => Promise<unknown[]>;
    };
    if (!p.getAnnotations) return null;
    const annots = await p.getAnnotations({ intent: "display" });
    const s = JSON.stringify(annots);
    return extractGptsFromJsonish(s);
  } catch {
    return null;
  }
}

/**
 * `preScanBytes` deve ser uma cópia independente do PDF (ex. `new Uint8Array(buf.slice(0))`).
 * O buffer passado a `pdfjs.getDocument` pode ser desligado pelo worker.
 */
export async function tryExtractPdfWgs84Bounds(
  preScanBytes: Uint8Array,
  pdf: {
    getMetadata: () => Promise<{ metadata?: { getRaw?: () => unknown } | null }>;
    getPage: (n: number) => Promise<unknown>;
  },
): Promise<Wgs84Bounds | null> {
  return (
    scanPdfBytesForGptsBounds(preScanBytes) ??
    scanPdfBytesForOgcGmlBounds(preScanBytes) ??
    (await extractBoundsFromPdfJsMetadata(pdf)) ??
    (await extractBoundsFromPdfPageAnnotations(pdf))
  );
}
