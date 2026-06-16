/** Cores por fase do processo minerário ANM. */
export function miningPhaseColor(phase: string): [number, number, number, number] {
  const p = (phase || "").toUpperCase();
  if (p.includes("LAVRA") || p.includes("CONCESS")) return [220, 38, 38, 170];
  if (p.includes("PESQUISA") || p.includes("AUTORIZA")) return [249, 115, 22, 165];
  if (p.includes("REQUERIMENTO") || p.includes("DISPONIB")) return [250, 204, 21, 150];
  if (p.includes("LICENCIAMENTO")) return [168, 85, 247, 155];
  return [234, 179, 8, 150];
}

export function sourceProtectionColor(): [number, number, number, number] {
  return [34, 211, 238, 120];
}

export function miningBlockColor(): [number, number, number, number] {
  return [239, 68, 68, 130];
}

export function placerReserveColor(): [number, number, number, number] {
  return [251, 191, 36, 140];
}
