export type RiskLevel = "baixo" | "medio" | "alto";

export function riskColor(risk: string): string {
  switch (risk) {
    case "alto":
      return "#ef4444";
    case "medio":
      return "#f59e0b";
    default:
      return "#22c55e";
  }
}

export function riskLabel(risk: string): string {
  switch (risk) {
    case "alto":
      return "Alto";
    case "medio":
      return "Médio";
    default:
      return "Baixo";
  }
}
