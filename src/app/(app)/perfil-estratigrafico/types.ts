export type Camada = {
  topo: number;
  base: number;
  material: string;
  cor: string;
};

/** `topo` / `base` em profundidade (m) abaixo do terreno local; `nivelAgua` idem, se existir. */
export type Furo = {
  id: string;
  x: number;
  cotaTerreno: number;
  nivelAgua?: number;
  camadas: Camada[];
};
