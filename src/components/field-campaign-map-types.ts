/** Tipos do mapa de campo — sem importar Leaflet (seguro para SSR). */

export type FieldFuroPin = {
  id: number;
  codigo: string;
  latitude: number | null;
  longitude: number | null;
};

export type FieldMapMode = "obra" | "furo";
