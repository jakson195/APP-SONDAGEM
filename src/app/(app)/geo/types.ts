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

export type GeoPhoto = {
  id: number;
  companyId: number;
  obraId: number | null;
  uploadedByUserId: number | null;
  latitude: number;
  longitude: number;
  altitude: number | null;
  imageUrl: string;
  storagePath: string;
  originalName: string | null;
  capturedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type StreetFrame = {
  id: string;
  companyId: number;
  obraId: number | null;
  uploadedByUserId: number | null;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  imageUrl: string;
  storagePath: string;
  videoId: string;
  frameIndex: number;
  timestamp: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type GeoCompany = {
  id: number;
  nome: string;
  slug?: string;
};

export type GeoObraContext = {
  id: number;
  nome: string;
  companyId: number;
  company?: {
    id: number;
    name: string;
  };
};

export type GeoObraOption = {
  id: number;
  nome: string;
  companyId: number;
};
