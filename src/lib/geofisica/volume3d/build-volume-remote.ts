/**
 * Cliente para o motor Python de volume 3D (FastAPI).
 */

import type { ResistivityVolume3D, VolumeBuildParams } from "./volume3d-types";
import type { VolumeSamplePoint3D } from "./collect-section-samples";

const DEFAULT_PYTHON_URL =
  process.env.NEXT_PUBLIC_GEOPHYSICS_ENGINE_URL ?? "http://127.0.0.1:8092";

export type PythonVolumeBuildPayload = {
  sample_points: { x: number; y: number; z: number; value: number }[];
  bounds: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
    max_z: number;
  };
  nx: number;
  ny: number;
  nz: number;
  method: "idw" | "kriging" | "rbf";
  idw_power: number;
  max_influence_m: number;
  rbf_epsilon?: number | null;
  kriging_variogram?: "spherical" | "exponential" | "gaussian";
};

export function samplesToPythonPayload(
  samples: VolumeSamplePoint3D[],
  params: VolumeBuildParams,
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    maxZ: number;
  },
): PythonVolumeBuildPayload {
  const method =
    params.interpMethod === "nearest" ? "idw" : params.interpMethod;
  return {
    sample_points: samples.map((s) => ({
      x: s.x,
      y: s.y,
      z: s.z,
      value: s.logRho,
    })),
    bounds: {
      min_x: bounds.minX,
      max_x: bounds.maxX,
      min_y: bounds.minY,
      max_y: bounds.maxY,
      max_z: bounds.maxZ,
    },
    nx: params.nx,
    ny: params.ny,
    nz: params.nz,
    method,
    idw_power: params.idwPower,
    max_influence_m: params.maxInfluenceM,
    ...(params.rbfEpsilon != null ? { rbf_epsilon: params.rbfEpsilon } : {}),
    kriging_variogram: params.krigingVariogram ?? "spherical",
  };
}

export function pythonResponseToVolume(
  logRho: number[],
  params: VolumeBuildParams,
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    maxZ: number;
  },
  anchorLat: number,
  anchorLng: number,
  lineIds: string[],
): ResistivityVolume3D {
  const { nx, ny, nz } = params;
  const dx = (bounds.maxX - bounds.minX) / nx;
  const dy = (bounds.maxY - bounds.minY) / ny;
  const dz = bounds.maxZ / nz;

  return {
    logRho: Float32Array.from(logRho, (v) => (Number.isFinite(v) ? v : NaN)),
    nx,
    ny,
    nz,
    originM: { x: bounds.minX, y: bounds.minY },
    cellSizeM: { x: dx, y: dy, z: dz },
    boundsM: { ...bounds, maxZ: bounds.maxZ },
    anchorLat,
    anchorLng,
    lineIds,
  };
}

export async function buildVolumeViaPython(
  payload: PythonVolumeBuildPayload,
  baseUrl = DEFAULT_PYTHON_URL,
): Promise<{ log_rho: number[]; valid_voxels: number }> {
  const res = await fetch(`${baseUrl}/api/v1/geophysics/volume/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail ?? `Motor Python HTTP ${res.status}`);
  }
  return (await res.json()) as { log_rho: number[]; valid_voxels: number };
}

export async function buildVolumeViaNextApi(
  payload: PythonVolumeBuildPayload,
): Promise<{ log_rho: number[]; valid_voxels: number }> {
  const res = await fetch("/api/geofisica/volume/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `API volume HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    ok: boolean;
    log_rho?: number[];
    valid_voxels?: number;
    error?: string;
  };
  if (!data.ok || !data.log_rho) {
    throw new Error(data.error ?? "Falha ao construir volume");
  }
  return { log_rho: data.log_rho, valid_voxels: data.valid_voxels ?? 0 };
}
