"use client";

/** Configura ícones padrão do Leaflet (só no browser). */
let configured = false;

export async function ensureLeafletSetup(): Promise<void> {
  if (typeof window === "undefined" || configured) return;
  const L = (await import("leaflet")).default;
  await import("leaflet/dist/leaflet.css");
  const cdn = "https://unpkg.com/leaflet@1.9.4/dist/images/";
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: `${cdn}marker-icon-2x.png`,
    iconUrl: `${cdn}marker-icon.png`,
    shadowUrl: `${cdn}marker-shadow.png`,
  });
  configured = true;
}
