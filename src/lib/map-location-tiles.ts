import sharp from "sharp";

const OUT_W = 640;
const OUT_H = 360;

/** Identificação exigida pela política de tiles OSM. */
const TILE_FETCH_HEADERS = {
  "User-Agent":
    "APP-SONDAGEM/1.0 (geotechnical reports; contact via app maintainer)",
  Accept: "image/png,image/webp,*/*",
};

function lngLatToWorldPx(lng: number, lat: number, z: number) {
  const scale = 256 * 2 ** z;
  const x = ((lng + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 -
      Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
      2) *
    scale;
  return { x, y };
}

async function fetchOsmTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  try {
    const r = await fetch(url, {
      headers: TILE_FETCH_HEADERS,
      next: { revalidate: 86400 },
    });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    if (ab.byteLength < 100) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/** Esri World Imagery — mesmo esquema z/y/x que o Leaflet usa no projeto. */
async function fetchEsriTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  try {
    const r = await fetch(url, {
      headers: TILE_FETCH_HEADERS,
      next: { revalidate: 86400 },
    });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    if (ab.byteLength < 100) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

async function fetchOneTile(
  z: number,
  x: number,
  y: number,
  preferImagery: boolean,
): Promise<Buffer | null> {
  if (preferImagery) {
    const esri = await fetchEsriTile(z, x, y);
    if (esri) return esri;
  }
  const osm = await fetchOsmTile(z, x, y);
  if (osm) return osm;
  if (!preferImagery) {
    return fetchEsriTile(z, x, y);
  }
  return null;
}

async function markerOverlayPng(): Promise<Buffer> {
  const svg = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10" fill="#0d9488" stroke="#ffffff" stroke-width="3"/><circle cx="16" cy="16" r="3" fill="#ffffff"/></svg>`,
  );
  return sharp(svg).ensureAlpha().png().toBuffer();
}

/**
 * Monta PNG 640×360 centrado em WGS84 a partir de tiles (OSM ou Esri).
 * @param preferImagery — tenta satélite Esri primeiro (alinhado ao PDF com Google satellite).
 */
export async function buildMapPngFromTiles(
  lat: number,
  lng: number,
  zoom: number,
  preferImagery = true,
): Promise<Buffer | null> {
  const z = Math.min(19, Math.max(1, Math.round(zoom)));
  const n = 2 ** z;

  const { x: worldX, y: worldY } = lngLatToWorldPx(lng, lat, z);
  const topLeftX = worldX - OUT_W / 2;
  const topLeftY = worldY - OUT_H / 2;

  const minTx = Math.floor(topLeftX / 256);
  const maxTx = Math.floor((topLeftX + OUT_W) / 256);
  const minTy = Math.floor(topLeftY / 256);
  const maxTy = Math.floor((topLeftY + OUT_H) / 256);

  const composites: sharp.OverlayOptions[] = [];

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (ty < 0 || ty >= n) continue;
      let normTx = tx;
      while (normTx < 0) normTx += n;
      while (normTx >= n) normTx -= n;

      const buf = await fetchOneTile(z, normTx, ty, preferImagery);
      if (!buf) continue;

      const left = Math.round(tx * 256 - topLeftX);
      const top = Math.round(ty * 256 - topLeftY);
      composites.push({ input: buf, left, top });
    }
  }

  if (composites.length === 0) return null;

  const bg = preferImagery ? "#1e293b" : "#e2e8f0";

  const marker = await markerOverlayPng();
  composites.push({
    input: marker,
    left: Math.round(OUT_W / 2 - 16),
    top: Math.round(OUT_H / 2 - 16),
  });

  try {
    return await sharp({
      create: {
        width: OUT_W,
        height: OUT_H,
        channels: 3,
        background: bg,
      },
    })
      .composite(composites)
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
