export type ImportedMapLayer = {
  id: string;
  name: string;
  color: [number, number, number, number];
  data: GeoJSON.FeatureCollection;
  visible: boolean;
};

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type MapCaptureApi = {
  fitPolygon: (ring: [number, number][], padding?: number) => Promise<void>;
  waitForRender: () => Promise<void>;
  captureCanvas: () => string | null;
  getCanvasSize: () => { width: number; height: number };
  getBounds: () => MapBounds;
  getBearing: () => number;
  getCenter: () => { lon: number; lat: number };
  getZoom: () => number;
};
