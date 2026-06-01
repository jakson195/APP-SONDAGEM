/** Ponto de topografia ao longo do perfil (distância, cota). */
export type TopographyPoint = {
  stationM: number;
  elevationM: number;
};

export type TopographyProfile = {
  points: TopographyPoint[];
  /** Origem dos dados (importação, manual, folha). */
  source?: "manual" | "import" | "sheet";
};
