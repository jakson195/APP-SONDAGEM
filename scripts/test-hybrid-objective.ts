import { objective } from "../src/lib/geofisica/dipolo2d/invert-core-2d";

const G = [[1, 0], [0, 1]];
const yObs = [1, -0.5];
const m = [0.8, -0.3];
const wData = [1, 1];
const huberC = 0.03;
const lambda = 0;
const nx = 1;
const nz = 2;

function huberLoss(r: number, c: number): number {
  const a = Math.abs(r);
  return a <= c ? 0.5 * r * r : c * (a - 0.5 * c);
}

function expectedPhi(alpha: number): number {
  const pred = [m[0]!, m[1]!];
  let s = 0;
  for (let d = 0; d < yObs.length; d++) {
    const r = yObs[d]! - pred[d]!;
    s += alpha * huberLoss(r, huberC) + (1 - alpha) * Math.abs(r);
  }
  return s;
}

for (const alpha of [0, 0.5, 1]) {
  const got = objective(G, yObs, m, wData, huberC, lambda, nx, nz, alpha);
  const exp = expectedPhi(alpha);
  if (Math.abs(got.phi - exp) > 1e-9) {
    console.error("FAIL alpha", alpha, { got: got.phi, exp });
    process.exit(1);
  }
}

console.log("OK hybrid objective α=0,0.5,1");
