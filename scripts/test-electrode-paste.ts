import {
  applyElectrodeToRows,
  applyGridToSolodataRows,
  emptySolodataRow,
  looksLikeElectrodeBlock,
  parseElectrodeBlock,
} from "../src/lib/geofisica/dipolo2d/solodata-grid-paste";
import { parseSolodataLinhaPaste } from "../src/lib/geofisica/dipolo2d/parse-solodata-linha-paste";

const COL_KEYS = [
  "medida",
  "piquete",
  "espM",
  "a",
  "b",
  "m",
  "nEl",
  "nivel",
] as const;

const tsv5 = ["1\t3\t5\t7\t9", "2\t4\t6\t8\t10", "3\t5\t7\t9\t11"].join("\n");

const block = parseElectrodeBlock(tsv5);
console.log("electrode block rows:", block.rows.length);
console.log("looks like electrodes:", looksLikeElectrodeBlock(block.rows));

const base = [emptySolodataRow(1, 15), emptySolodataRow(2, 15)];
const merged = applyElectrodeToRows(base, block.rows, 0, 15);
console.log("merged row0:", {
  a: merged[0]!.a,
  b: merged[0]!.b,
  m: merged[0]!.m,
  nEl: merged[0]!.nEl,
  nivel: merged[0]!.nivel,
});

const grid = applyGridToSolodataRows(
  base.map((r) => ({ ...r })),
  tsv5.split("\n").map((l) => l.split("\t")),
  0,
  3,
  [...COL_KEYS],
  15,
);
console.log("grid paste at col A:", {
  a: grid[0]!.a,
  b: grid[0]!.b,
  nivel: grid[0]!.nivel,
  dist: grid[0]!.dist,
});

const parsed = parseSolodataLinhaPaste(tsv5, 15);
console.log("parse 5 col:", parsed.rows[0]);
