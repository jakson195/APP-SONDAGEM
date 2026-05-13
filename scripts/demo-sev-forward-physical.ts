import { forwardPhysical } from "../lib/geofisica/sev-forward-physical.js";

const model = {
  rhos: [1360, 4776, 3000, 2950],
  hs: [20.5, 81.7, 100],
};

const ab2 = [
  1.5, 2, 2.5, 3.2, 4, 5, 6.5, 8, 10, 13, 16, 20, 25, 32, 40, 50, 65, 80, 100, 130,
];

const curva = forwardPhysical(ab2, model);

console.log(curva);
