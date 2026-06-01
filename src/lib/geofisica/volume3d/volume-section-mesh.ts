/**
 * Malha 3D de secção invertida «draped» ao longo da topografia do perfil.
 */

import * as THREE from "three";
import { interpolateTopographyAt } from "../dipolo2d/parse-topography";
import type { Dipolo2DInvertResult } from "../dipolo2d/types";
import type { GeophysSurveyLine, ResistivityVolume3D } from "./volume3d-types";
import type { LineSegmentLocal } from "./line-geometry-3d";
import {
  surfaceSceneYAtXY,
} from "./volume-terrain-surface";

function profileSceneY(
  line: GeophysSurveyLine,
  volume: ResistivityVolume3D,
  stationM: number,
  seg: LineSegmentLocal,
  x0: number,
  x1: number,
): number {
  if (line.topography && line.topography.length >= 2) {
    const elev = interpolateTopographyAt(line.topography, stationM);
    if (elev != null && Number.isFinite(elev) && volume.surfaceRefM != null) {
      return elev - volume.surfaceRefM;
    }
  }

  const span = Math.max(x1 - x0, 1e-6);
  const t = Math.max(0, Math.min(1, (stationM - x0) / span));
  const px = seg.start.x + t * (seg.end.x - seg.start.x);
  const pz = seg.start.y + t * (seg.end.y - seg.start.y);

  if (volume.followTerrain && volume.surfaceM) {
    return surfaceSceneYAtXY(volume, px, pz);
  }
  return 0;
}

/** Geometria subdividida (nx×nz) com vértices abaixo do terreno do perfil. */
export function buildDrapedSectionGeometry(
  line: GeophysSurveyLine,
  result: Dipolo2DInvertResult,
  volume: ResistivityVolume3D,
  seg: LineSegmentLocal,
): THREE.BufferGeometry | null {
  const { nx, nz, xEdgesM, zEdgesM } = result;
  if (nx < 1 || nz < 1) return null;

  const x0 = xEdgesM[0]!;
  const x1 = xEdgesM[nx] ?? xEdgesM[xEdgesM.length - 1]!;
  const cols = nx + 1;
  const rows = nz + 1;
  const positions = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);

  for (let j = 0; j <= nz; j++) {
    const depthM = zEdgesM[j] ?? 0;
    for (let i = 0; i <= nx; i++) {
      const stationM =
        i === 0
          ? x0
          : i === nx
            ? x1
            : (xEdgesM[i]! + xEdgesM[i + 1]!) / 2;

      const span = Math.max(x1 - x0, 1e-6);
      const t = Math.max(0, Math.min(1, (stationM - x0) / span));
      const px = seg.start.x + t * (seg.end.x - seg.start.x);
      const pz = seg.start.y + t * (seg.end.y - seg.start.y);
      const py = profileSceneY(line, volume, stationM, seg, x0, x1) - depthM;

      const vi = i + j * cols;
      positions[vi * 3] = px;
      positions[vi * 3 + 1] = py;
      positions[vi * 3 + 2] = pz;

      uvs[vi * 2] = i / nx;
      uvs[vi * 2 + 1] = 1 - j / nz;
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = i + j * cols;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function sectionUsesTopographyDrape(
  line: GeophysSurveyLine,
  volume: ResistivityVolume3D,
): boolean {
  if (line.topography && line.topography.length >= 2) return true;
  return Boolean(volume.followTerrain && volume.surfaceM);
}
