import type { RiskLevel } from "./types";

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

export function riskBgClass(risk: RiskLevel): string {
  switch (risk) {
    case "alto":
      return "bg-red-500/20 text-red-200 border-red-500/40";
    case "medio":
      return "bg-amber-500/20 text-amber-100 border-amber-500/40";
    default:
      return "bg-emerald-500/20 text-emerald-100 border-emerald-500/40";
  }
}
