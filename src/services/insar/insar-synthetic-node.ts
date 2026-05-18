import { writeFile } from "fs/promises";
import { join } from "path";
import { writeArrayBuffer } from "geotiff";

export type SyntheticJobContext = {
  aoi_wkt: string;
  reference_date: string | null;
  scenes: Array<{ scene_id: string; acquisition_date: string }>;
};

function bboxFromWkt(wkt: string): [number, number, number, number] {
  const nums = wkt.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 4) {
    return [-47.8, -15.8, -47.7, -15.7];
  }
  const lons = nums.filter((_, i) => i % 2 === 0);
  const lats = nums.filter((_, i) => i % 2 === 1);
  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ];
}

function gridSize(
  bounds: [number, number, number, number],
  resolutionDeg = 0.002,
): { width: number; height: number } {
  const [minx, miny, maxx, maxy] = bounds;
  return {
    width: Math.max(32, Math.floor((maxx - minx) / resolutionDeg)),
    height: Math.max(32, Math.floor((maxy - miny) / resolutionDeg)),
  };
}

function geotiffMeta(
  width: number,
  height: number,
  bounds: [number, number, number, number],
): Parameters<typeof writeArrayBuffer>[1] {
  const [minx, miny, maxx, maxy] = bounds;
  const pixelW = (maxx - minx) / width;
  const pixelH = (maxy - miny) / height;
  return {
    width,
    height,
    SampleFormat: [3],
    BitsPerSample: [32],
    GDAL_NODATA: "-9999",
    ModelPixelScale: [pixelW, pixelH, 0],
    ModelTiepoint: [0, 0, 0, minx, maxy, 0],
    GeographicTypeGeoKey: 4326,
  };
}

function syntheticStack(
  bounds: [number, number, number, number],
  scenes: SyntheticJobContext["scenes"],
  refIso: string | null,
): Array<{ epoch: string; data: Float32Array; w: number; h: number }> {
  const { width: w, height: h } = gridSize(bounds);
  const [minx, miny, maxx, maxy] = bounds;
  const ref = refIso ? new Date(refIso) : new Date(scenes[0]!.acquisition_date);
  const out: Array<{ epoch: string; data: Float32Array; w: number; h: number }> =
    [];

  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si]!;
    const acq = new Date(scene.acquisition_date);
    const days = (acq.getTime() - ref.getTime()) / 86_400_000;
    const data = new Float32Array(w * h);
    let seed = 0;
    for (let i = 0; i < scene.scene_id.length; i++) {
      seed = (seed * 31 + scene.scene_id.charCodeAt(i)) >>> 0;
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const lon = minx + (x / w) * (maxx - minx);
        const lat = miny + (y / h) * (maxy - miny);
        const trend = days * 0.15;
        const spatial = 8 * Math.sin(lon * 80) * Math.cos(lat * 80);
        const noise = (Math.sin(seed + x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        const n = noise < 0 ? noise + 1 : noise;
        data[y * w + x] = trend + spatial + (n - 0.5) * 3;
      }
    }
    out.push({
      epoch: acq.toISOString().slice(0, 10),
      data,
      w,
      h,
    });
  }
  return out;
}

async function writeTif(
  path: string,
  data: Float32Array,
  w: number,
  h: number,
  bounds: [number, number, number, number],
): Promise<void> {
  const buf = writeArrayBuffer(data, geotiffMeta(w, h, bounds));
  await writeFile(path, Buffer.from(buf));
}

/** GeoTIFF sintéticos em Node (sem Python rasterio). */
export async function runSyntheticFallbackNode(
  workDir: string,
  ctx: SyntheticJobContext,
): Promise<void> {
  const bounds = bboxFromWkt(ctx.aoi_wkt);
  const stack = syntheticStack(bounds, ctx.scenes, ctx.reference_date);

  if (stack.length > 0) {
    const { w, h } = stack[0]!;
    const last = stack[stack.length - 1]!.data;
    const first = stack[0]!.data;
    const wrapped = new Float32Array(w * h);
    const unwrapped = new Float32Array(w * h);
    const ifg = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      wrapped[i] = Math.sin((last[i]! / 12) * Math.PI);
      unwrapped[i] = last[i]! * 0.08;
      ifg[i] = last[i]! - first[i]!;
    }
    await writeTif(join(workDir, "wrapped_phase.tif"), wrapped, w, h, bounds);
    await writeTif(join(workDir, "unwrapped_phase.tif"), unwrapped, w, h, bounds);
    await writeTif(join(workDir, "interferogram.tif"), ifg, w, h, bounds);
  }

  for (const { epoch, data, w, h } of stack) {
    await writeTif(
      join(workDir, `displacement_${epoch}.tif`),
      data,
      w,
      h,
      bounds,
    );
  }

  if (stack.length >= 2) {
    const { w, h } = stack[0]!;
    const d0 = stack[0]!.data;
    const d1 = stack[stack.length - 1]!.data;
    const t0 = new Date(stack[0]!.epoch).getTime();
    const t1 = new Date(stack[stack.length - 1]!.epoch).getTime();
    const dtYr = Math.max((t1 - t0) / (365.25 * 86_400_000), 1 / 365.25);
    const vel = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      vel[i] = (d1[i]! - d0[i]!) / dtYr;
    }
    await writeTif(join(workDir, "velocity.tif"), vel, w, h, bounds);
  }

  if (stack.length > 0) {
    const { w, h } = stack[0]!;
    const coh = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      coh[i] = 0.55 + 0.35 * ((i * 17) % 100) / 100;
    }
    await writeTif(join(workDir, "coherence.tif"), coh, w, h, bounds);
  }
}
