/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Token Cesium Ion — terreno mundial, Bing Aerial e 3D Tiles Ion */
  readonly VITE_CESIUM_ION_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
