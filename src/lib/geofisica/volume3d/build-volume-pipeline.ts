/**
 * Orquestra construção do volume 3D (browser ou Python engine).
 */

import type {
  GeophysSurveyLine,
  ResistivityVolume3D,
  VolumeBuildParams,
} from "./volume3d-types";
import { buildResistivityVolume3D } from "./build-volume-3d";
import { attachTerrainSurfaceToVolumeAsync } from "./volume-terrain-surface";
import { computeSurveyAnchor } from "./geometry-coords";
import {
  collectSectionSamplePoints,
  samplePointsBounds,
  type VolumeSamplePoint3D,
} from "./collect-section-samples";
import {
  buildVolumeViaNextApi,
  pythonResponseToVolume,
  samplesToPythonPayload,
} from "./build-volume-remote";

export async function buildVolume3D(
  lines: GeophysSurveyLine[],
  params: VolumeBuildParams,
  extraSamples: VolumeSamplePoint3D[] = [],
): Promise<ResistivityVolume3D | null> {
  const inverted = lines.filter((l) => l.invertResult);
  const sectionSamples = collectSectionSamplePoints(inverted, 1);
  const samples = [...sectionSamples, ...extraSamples];

  if (samples.length < 8) {
    if (inverted.length < 2) return null;
  } else if (inverted.length < 1 && extraSamples.length < 20) {
    return null;
  }

  const usePython =
    params.engine === "python" ||
    params.interpMethod === "kriging" ||
    params.interpMethod === "rbf";

  if (usePython && samples.length >= 4) {
    const padM = Math.max(20, params.maxInfluenceM * 0.5);
    const bounds = samplePointsBounds(samples, padM);
    if (!bounds) return inverted.length >= 2 ? buildResistivityVolume3D(lines, params) : null;

    const zMax = Math.max(params.zMaxM, bounds.maxZ);
    const boundsFull = { ...bounds, maxZ: zMax };
    const payload = samplesToPythonPayload(samples, params, boundsFull);

    try {
      const result = await buildVolumeViaNextApi(payload);
      const anchor = computeSurveyAnchor(inverted.length ? inverted : lines);
      const vol = pythonResponseToVolume(
        result.log_rho,
        params,
        boundsFull,
        anchor.lat,
        anchor.lng,
        inverted.map((l) => l.id),
      );
      return await attachTerrainSurfaceToVolumeAsync(
        vol,
        inverted.length ? inverted : lines,
        params,
      );
    } catch {
      /* fallback browser */
    }
  }

  if (inverted.length < 2) return null;
  const vol = buildResistivityVolume3D(lines, params);
  if (!vol) return null;
  return await attachTerrainSurfaceToVolumeAsync(vol, inverted, params);
}
