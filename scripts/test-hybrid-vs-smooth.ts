import { invertDipolo2D } from "../src/lib/geofisica/dipolo2d/invert-methods-2d";
import { res2dinvDataPreset } from "../src/lib/geofisica/dipolo2d/smooth-invert-2d";
import { solodataLinhaToReadings } from "../src/lib/geofisica/dipolo2d/solodata-linha-readings";
import { loadSolodataLinha12Demo } from "../src/lib/geofisica/dipolo2d/solodata-linha-demo";

const linha = loadSolodataLinha12Demo();
const readings = solodataLinhaToReadings(linha, 15).filter((r) => !r.excluded);
const params = { ...res2dinvDataPreset, hybridAlpha: 0.65 };

const smooth = invertDipolo2D(readings, params, "smoothness");
const hybrid = invertDipolo2D(readings, params, "hybrid");

if (!smooth || !hybrid) {
  console.error("FAIL inversion returned null");
  process.exit(1);
}

let maxDiff = 0;
for (let i = 0; i < smooth.mLog10.length; i++) {
  maxDiff = Math.max(maxDiff, Math.abs(smooth.mLog10[i]! - hybrid.mLog10[i]!));
}

const rmsDiff = Math.abs(smooth.rmsLog10 - hybrid.rmsLog10);

if (maxDiff < 1e-4 && rmsDiff < 1e-6) {
  console.error("FAIL smoothness and hybrid are identical", {
    maxDiff,
    rmsDiff,
    smoothRms: smooth.rmsLog10,
    hybridRms: hybrid.rmsLog10,
  });
  process.exit(1);
}

console.log("OK smooth vs hybrid differ", {
  maxDiff: maxDiff.toFixed(6),
  smoothRms: smooth.rmsLog10.toFixed(6),
  hybridRms: hybrid.rmsLog10.toFixed(6),
  hybridLabel: hybrid.methodLabel,
});
