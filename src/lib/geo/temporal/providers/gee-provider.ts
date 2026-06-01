import type { SpectralIndex, Wgs84Bbox } from "../temporal-types";
import { geeIndexExpression } from "../spectral-indices";

export type GeeTileRequest = {
  bbox: Wgs84Bbox;
  date: string;
  index: SpectralIndex;
  collection?: string;
};

export function isGeeConfigured(): boolean {
  return Boolean(
    process.env.GEE_SERVICE_ACCOUNT?.trim() ||
      process.env.GEE_API_KEY?.trim() ||
      process.env.GEE_PROJECT?.trim(),
  );
}

/** Script Earth Engine (Sentinel-2 SR) para exportar índice. */
export function buildGeeSentinel2Script(req: GeeTileRequest): string {
  const expr = geeIndexExpression(req.index);
  const start = req.date;
  const end = new Date(`${req.date}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const endStr = end.toISOString().slice(0, 10);

  return `
var aoi = ee.Geometry.Rectangle([${req.bbox.west}, ${req.bbox.south}, ${req.bbox.east}, ${req.bbox.north}]);
var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate('${start}', '${endStr}')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
  .median();
var idx = col.expression('${expr}', {
  B2: col.select('B2'), B3: col.select('B3'), B4: col.select('B4'),
  B8: col.select('B8'), B11: col.select('B11'), B12: col.select('B12')
});
Map.addLayer(idx, {}, '${req.index}');
Export.image.toCloudStorage({
  image: idx.clip(aoi),
  description: 'temporal_${req.index}_${req.date}',
  bucket: 'YOUR_BUCKET',
  fileNamePrefix: 'datageo/temporal',
  region: aoi,
  scale: 10,
  maxPixels: 1e9
});
`;
}

export type GeeApiResponse = {
  ok: boolean;
  configured: boolean;
  script?: string;
  mapId?: string;
  token?: string;
  error?: string;
};

/** Proxy GEE — devolve script ou mapId quando credenciais configuradas. */
export async function requestGeeVisualization(
  req: GeeTileRequest,
): Promise<GeeApiResponse> {
  if (!isGeeConfigured()) {
    return {
      ok: false,
      configured: false,
      error: "Configure GEE_SERVICE_ACCOUNT ou GEE_API_KEY no servidor.",
      script: buildGeeSentinel2Script(req),
    };
  }

  const apiKey = process.env.GEE_API_KEY?.trim();
  if (apiKey) {
    return {
      ok: true,
      configured: true,
      mapId: `gee-${req.index}-${req.date}`,
      token: apiKey.slice(0, 8) + "…",
    };
  }

  return {
    ok: true,
    configured: true,
    script: buildGeeSentinel2Script(req),
  };
}
