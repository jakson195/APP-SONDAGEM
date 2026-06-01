import { parseRes2dinvDat } from "../src/lib/geofisica/dipolo2d/parse-res2dinv-dat";
import { parseRes2dinvDatWithTopography } from "../src/lib/geofisica/dipolo2d/parse-dipolo-import";

const line =
  "4 15.00 122.281 0.00 117.2 30.00 126.95 45.00 130.228 1274";

const extendedDat = `Garuva type4
15
11
3
1
4
0
0
${line}
${line.replace("0.00 117.2", "25.00 118.5").replace("45.00 130.228", "60.00 130.228")}
${line.replace("0.00 117.2", "50.00 119.3").replace("45.00 130.228", "75.00 130.228")}
${line.replace("0.00 117.2", "75.00 120.1").replace("45.00 130.228", "90.00 130.228")}
0 0 0`;

const standardDat = `Standard
7.5
11
3
1
4
0
0
4 0 0 0 7.5 0 0 15 0 45.67
4 0 0 0 7.5 0 0 22.5 0 52.34
4 0 0 0 7.5 0 0 30 0 61.2
4 0 0 0 7.5 0 0 37.5 0 58.1
0 0 0`;

const wtExt = parseRes2dinvDatWithTopography(extendedDat);
const wtStd = parseRes2dinvDatWithTopography(standardDat);

console.log("extended station", wtExt?.readings[0]?.stationM);
console.log("extended topo", wtExt?.topography);

if (!wtExt || wtExt.topography.length < 2) {
  console.error("FAIL extended topo");
  process.exit(1);
}
if (wtExt.topography[0]?.elevationM !== 117.2) {
  console.error("FAIL elevation", wtExt.topography[0]);
  process.exit(1);
}
if (wtExt.readings[0]?.profileStationM !== 0) {
  console.error("FAIL profile station", wtExt.readings[0]?.profileStationM);
  process.exit(1);
}
if (wtExt.readings[0]?.stationM !== 30) {
  console.error("FAIL geometric station", wtExt.readings[0]?.stationM);
  process.exit(1);
}
if (wtStd?.readings[0]?.terrainElevationM != null) {
  console.error("FAIL standard should not have terrain cols");
  process.exit(1);
}
console.log("OK");
