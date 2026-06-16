/** Legenda interpretativa — magnetometria aerogeofísica CPRM/SGB. */

export type MagnetometryLegendItem = {
  label: string;
  color: string;
  hint?: string;
};

export type MagnetometryLegendBlock = {
  id: "magnetometry_ternary" | "magnetometry_anomaly";
  title: string;
  subtitle: string;
  items?: MagnetometryLegendItem[];
  /** Gradiente contínuo (anomalia). */
  gradient?: { from: string; to: string; mid?: string; labels: [string, string, string?] };
};

/** Mapa ternário RGB — composição padrão CPRM (TERN_Brasil). */
export const MAGNETOMETRY_TERNARY_LEGEND: MagnetometryLegendBlock = {
  id: "magnetometry_ternary",
  title: "Mapa ternário (RGB)",
  subtitle: "Composição de bandas magnéticas aerogeofísicas",
  items: [
    { label: "Canal vermelho (R)", color: "#e63946", hint: "Intensidade total (ITM)" },
    { label: "Canal verde (G)", color: "#2a9d8f", hint: "1ª derivada vertical (1VD)" },
    { label: "Canal azul (B)", color: "#457b9d", hint: "Sinal analítico (SA)" },
  ],
};

/** Anomalia magnética total — AM_Brasil. */
export const MAGNETOMETRY_ANOMALY_LEGEND: MagnetometryLegendBlock = {
  id: "magnetometry_anomaly",
  title: "Anomalia magnética (ΔT)",
  subtitle: "Desvio em relação ao campo regional (IGRF)",
  gradient: {
    from: "#1e3a8a",
    mid: "#f8fafc",
    to: "#b91c1c",
    labels: ["Baixa", "Neutra", "Alta"],
  },
};

export const MAGNETOMETRY_LEGENDS: MagnetometryLegendBlock[] = [
  MAGNETOMETRY_TERNARY_LEGEND,
  MAGNETOMETRY_ANOMALY_LEGEND,
];

export function magnetometryLegendForLayer(layerId: string): MagnetometryLegendBlock | undefined {
  return MAGNETOMETRY_LEGENDS.find((l) => l.id === layerId);
}
