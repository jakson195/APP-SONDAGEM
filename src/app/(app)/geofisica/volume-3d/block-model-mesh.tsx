"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ResistivityVolume3D } from "@/lib/geofisica/volume3d/volume3d-types";
import type { VolumeRhoFilter } from "@/lib/geofisica/volume3d/volume-rho-filter";
import {
  applyClippingToMaterial,
} from "@/lib/geofisica/3d-engine/clipping-planes";
import { buildBlockInstanceBuffers } from "@/lib/geofisica/3d-engine/block-model";

type Props = {
  volume: ResistivityVolume3D;
  logLo: number;
  logHi: number;
  opacity: number;
  decimate: number;
  clipDepthM: number | null;
  clipPlanes: THREE.Plane[];
  rhoFilter?: VolumeRhoFilter;
  /** Quando true, blocos não tapam os planos 2D das secções. */
  deferToSections?: boolean;
};

export function BlockModelMesh({
  volume,
  logLo,
  logHi,
  opacity,
  decimate,
  clipDepthM,
  clipPlanes,
  rhoFilter,
  deferToSections = false,
}: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const buffers = useMemo(
    () =>
      buildBlockInstanceBuffers(volume, {
        logLo,
        logHi,
        decimate,
        clipDepthM,
        rhoFilterEnabled: rhoFilter?.enabled ?? false,
        rhoMinOhmM: rhoFilter?.enabled ? rhoFilter.rhoMinOhmM : null,
        rhoMaxOhmM: rhoFilter?.enabled ? rhoFilter.rhoMaxOhmM : null,
      }),
    [volume, logLo, logHi, decimate, clipDepthM, rhoFilter],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || buffers.count === 0) return;

    mesh.count = buffers.count;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let n = 0; n < buffers.count; n++) {
      dummy.position.set(
        buffers.centers[n * 3]!,
        buffers.centers[n * 3 + 1]!,
        buffers.centers[n * 3 + 2]!,
      );
      dummy.scale.set(
        buffers.scales[n * 3]!,
        buffers.scales[n * 3 + 1]!,
        buffers.scales[n * 3 + 2]!,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);

      color.setRGB(
        buffers.colors[n * 3]!,
        buffers.colors[n * 3 + 1]!,
        buffers.colors[n * 3 + 2]!,
      );
      mesh.setColorAt(n, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [buffers]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity,
      metalness: 0.05,
      roughness: 0.75,
      vertexColors: false,
      depthWrite: !deferToSections,
    });
    applyClippingToMaterial(m, clipPlanes);
    return m;
  }, [opacity, clipPlanes, deferToSections]);

  if (buffers.count === 0) return null;

  return (
    <instancedMesh
      key={`blocks-${buffers.count}-${decimate}`}
      ref={meshRef}
      args={[undefined, undefined, buffers.count]}
      material={material}
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
}
