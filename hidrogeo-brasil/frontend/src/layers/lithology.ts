/** Paleta CPRM simplificada por tipo de rocha. */
const ROCK_COLORS: Record<string, [number, number, number]> = {
  "Granito-Gnáisse": [198, 134, 66],
  "Granito": [210, 150, 80],
  "Arenito-Conglomerado": [255, 235, 130],
  "Metassedimento": [180, 200, 160],
  "Basalto": [80, 80, 90],
  "Basalto-Siltito": [100, 100, 110],
  "Metassedimento-Granito": [170, 185, 145],
};

export function lithologyColor(rockType: string): [number, number, number, number] {
  for (const [key, rgb] of Object.entries(ROCK_COLORS)) {
    if (rockType.toLowerCase().includes(key.toLowerCase().slice(0, 5))) {
      return [rgb[0], rgb[1], rgb[2], 160];
    }
  }
  return [160, 140, 120, 150];
}

export const LITHOLOGY_LEGEND = Object.entries(ROCK_COLORS).map(([label, rgb]) => ({
  label,
  color: `rgb(${rgb.join(",")})`,
}));
