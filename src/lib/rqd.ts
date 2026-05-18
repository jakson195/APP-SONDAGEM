/** Etiquetas padrão NBR (faixas de RQD %). */
export const QUALIDADES_RQD = [
  "Muito fraca",
  "Fraca",
  "Regular",
  "Boa",
  "Excelente",
] as const;

/** Classificação qualitativa do RQD (%), faixas usuais em geotecnia. */
export function classificarRQD(rqd: number): string {
  if (rqd < 25) return "Muito fraca";
  if (rqd < 50) return "Fraca";
  if (rqd < 75) return "Regular";
  if (rqd < 90) return "Boa";
  return "Excelente";
}

/** Qualidade exibida no relatório: manual ou derivada do RQD. */
export function textoQualidadeRqd(rqd: number, qualidadeManual?: string): string {
  const q = qualidadeManual?.trim();
  if (q) return q;
  return classificarRQD(rqd);
}
