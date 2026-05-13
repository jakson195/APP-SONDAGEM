/** Furo criado no mapa (clique); distinto do `Furo` do perfil estratigráfico. */
export type FuroMapa = {
  id: string;
  lat: number;
  lng: number;
  camadas: unknown[];
  nome: string;
  descricao: string;
  createdAtIso: string;
};
