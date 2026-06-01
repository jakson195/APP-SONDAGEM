import * as THREE from "three";

/** Planos de clipping para volume 3D (profundidade e laterais). */
export function createVolumeClipPlanes(options: {
  clipDepthM: number | null;
  boundsMaxZ: number;
  enabled: boolean;
}): THREE.Plane[] {
  if (!options.enabled || options.clipDepthM == null) return [];
  const yClip = -options.clipDepthM;
  return [new THREE.Plane(new THREE.Vector3(0, 1, 0), -yClip)];
}

export function applyClippingToMaterial(
  material: THREE.Material,
  planes: THREE.Plane[],
): void {
  const m = material as THREE.MeshBasicMaterial;
  m.clippingPlanes = planes;
  m.clipIntersection = false;
  m.needsUpdate = true;
}
