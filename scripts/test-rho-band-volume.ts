import { computeRhoBandVolumeStats } from "../src/lib/geofisica/3d-engine/block-model";
import type { ResistivityVolume3D } from "../src/lib/geofisica/volume3d/volume3d-types";

const vol: ResistivityVolume3D = {
  logRho: Float32Array.from([
    Math.log10(30),
    Math.log10(40),
    Math.log10(1000),
    Math.log10(25),
  ]),
  nx: 2,
  ny: 2,
  nz: 1,
  originM: { x: 0, y: 0 },
  cellSizeM: { x: 10, y: 10, z: 5 },
  boundsM: { minX: 0, maxX: 20, minY: 0, maxY: 20, maxZ: 5 },
  anchorLat: -26,
  anchorLng: -48,
  lineIds: ["a", "b"],
};

const cellVol = 10 * 10 * 5; // 500 m³
const stats = computeRhoBandVolumeStats(vol, {
  enabled: true,
  rhoMinOhmM: 10,
  rhoMaxOhmM: 50,
});

if (stats.cellCount !== 3) {
  console.error("FAIL cellCount", stats.cellCount);
  process.exit(1);
}
if (Math.abs(stats.volumeM3 - 3 * cellVol) > 1e-6) {
  console.error("FAIL volumeM3", stats.volumeM3, 3 * cellVol);
  process.exit(1);
}
if (Math.abs(stats.fractionPercent - 75) > 0.1) {
  console.error("FAIL fraction", stats.fractionPercent);
  process.exit(1);
}

console.log("OK rho band volume", {
  volumeM3: stats.volumeM3,
  fraction: stats.fractionPercent.toFixed(1) + "%",
});
