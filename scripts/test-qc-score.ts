import {
  computeLineQualityScore,
  computeReadingQualityScore,
  scoreToGrade,
} from "../src/lib/geofisica/qc/qc-score";

const goodLine = computeLineQualityScore({
  rhoOhmM: [80, 85, 82, 88, 84, 86],
  stationsM: [0, 15, 30, 45, 60, 75],
  residualLogRho: [0.01, -0.008, 0.005, -0.01, 0.006, -0.004],
  snr: 14,
  spectralNoiseIndex: 0.12,
  spikeRatio: 0,
  maxAbruptChange: 0.05,
  stabilityCv: 0.04,
  field: {
    spMv: [2, 1.5, 2.2, 1.8, 2, 1.6],
    vMv: [45, 48, 46, 50, 47, 49],
    iMa: [12, 11, 13, 12, 11.5, 12.5],
  },
});

const noisyLine = computeLineQualityScore({
  rhoOhmM: [80, 200, 75, 350, 70, 90],
  stationsM: [0, 15, 30, 45, 60, 75],
  residualLogRho: [0.02, 0.45, -0.3, 0.55, -0.25, 0.05],
  snr: 2.5,
  spectralNoiseIndex: 0.65,
  spikeRatio: 0.33,
  maxAbruptChange: 0.42,
  stabilityCv: 0.38,
  field: {
    spMv: [25, -30, 40, 15, -20, 35],
    vMv: [12, 8, 15, 6, 10, 9],
    iMa: [1.2, 0.8, 1.5, 0.6, 1, 0.9],
  },
});

console.log("Boa linha:", goodLine.total.toFixed(0), scoreToGrade(goodLine.total));
console.log("Ruidosa:", noisyLine.total.toFixed(0), scoreToGrade(noisyLine.total));

const pt = computeReadingQualityScore({
  index: 1,
  rhoOhmM: 200,
  residual: 0.45,
  isSpike: true,
  localSnr: 3,
  spMv: -30,
  vMv: 8,
  iMa: 0.8,
  lineViMedian: 4,
  neighborRhos: [80, 200, 75],
});
console.log("Leitura spike:", pt.toFixed(0));
