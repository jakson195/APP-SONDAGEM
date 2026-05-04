/**
 * Secção geológica (não confundir com o model Prisma `Furo`).
 * Mesma forma que `CamadaEstratigrafica` em `components/perfil-estratigrafico.tsx`.
 */
export type Camada = {
  topo: number;
  base: number;
  material: string;
  cor: string;
};

export type Furo = {
  id: string;
  x: number;
  cotaTerreno: number;
  nivelAgua?: number;
  camadas: Camada[];
};

/** Profundidade máxima (m) a partir das bases das camadas. */
export function profundidadeMaxCamadas(furo: Furo): number {
  if (furo.camadas.length === 0) return 0;
  return Math.max(...furo.camadas.map((c) => c.base));
}

/** Dois furos de exemplo (SP01 / SP02). */
export const furos: Furo[] = [
  {
    id: "SP01",
    x: 0,
    cotaTerreno: 0,
    nivelAgua: 2,
    camadas: [
      { topo: 0, base: 2, material: "Argila", cor: "#8B4513" },
      { topo: 2, base: 6, material: "Areia", cor: "#f4a460" },
    ],
  },
  {
    id: "SP02",
    x: 40,
    cotaTerreno: -1,
    nivelAgua: 3,
    camadas: [
      { topo: 0, base: 1.5, material: "Argila", cor: "#8B4513" },
      { topo: 1.5, base: 5, material: "Areia", cor: "#f4a460" },
    ],
  },
];
