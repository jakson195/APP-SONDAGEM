import type { Furo } from "../types";

export function listarMateriais(furos: Furo[]): string[] {
  return Array.from(
    new Set(furos.flatMap((f) => f.camadas.map((c) => c.material))),
  );
}

export function profundidadeMaxCamadasFuro(furo: Furo): number {
  if (furo.camadas.length === 0) return 0;
  return Math.max(...furo.camadas.map((c) => c.base));
}

export function corParaMaterial(furos: Furo[], material: string): string {
  for (const f of furos) {
    const c = f.camadas.find((x) => x.material === material);
    if (c) return c.cor;
  }
  return "#ccc";
}
