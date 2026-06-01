import {
  computeSolodataLinhaRow,
  solodataGFromNivel,
  solodataKFromG,
  solodataRapFromField,
} from "../src/lib/geofisica/dipolo2d/solodata-linha-compute";
import demo from "../src/lib/geofisica/dipolo2d/solodata-linha12-demo.json";

const h = 1;
const gExp = 1 / (1 / h - 2 / (h + 1) + 1 / (h + 2));
const gFn = solodataGFromNivel(h)!;
if (Math.abs(gExp - 3) > 1e-9 || Math.abs(gFn - 3) > 1e-9) {
  console.error("FAIL G formula", gExp, gFn);
  process.exit(1);
}

const kFn = solodataKFromG(3, 15);
if (Math.abs(kFn - 282.7) > 0.05) {
  console.error("FAIL K formula", kFn);
  process.exit(1);
}

const rapFn = solodataRapFromField(282.6, -10.23, 41.67, 18.18)!;
if (Math.abs(rapFn - 806.762) > 1) {
  console.error("FAIL Rap formula", rapFn);
  process.exit(1);
}

const r0 = demo.rows[0]!;
const c0 = computeSolodataLinhaRow(r0, 15);
if (Math.abs((c0.g ?? 0) - 3) > 0.01) {
  console.error("FAIL g", c0.g);
  process.exit(1);
}
if (Math.abs((c0.k ?? 0) - 282.6) > 0.1) {
  console.error("FAIL k", c0.k);
  process.exit(1);
}
if (Math.abs((c0.rapCalc ?? 0) - 806.762) > 1) {
  console.error("FAIL rap", c0.rapCalc);
  process.exit(1);
}

const res2d = computeSolodataLinhaRow(
  {
    ...r0,
    a: 15,
    b: 30,
    m: 45,
    nEl: 60,
    spMv: null,
    vMv: -10.23,
    iMa: 18.18,
    g: null,
    k: null,
    rapCalc: null,
    dist: null,
    nSep: null,
  },
  15,
);
if (res2d.nSep !== 1) {
  console.error("FAIL res2d nSep", res2d.nSep);
  process.exit(1);
}
console.log("OK", { g: c0.g, k: c0.k, rap: c0.rapCalc?.toFixed(1), dist: c0.dist });
