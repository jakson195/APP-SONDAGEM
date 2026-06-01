import type { RegionalGeologyProfile } from "./interpret-types";
import type { ResistivityRefRow } from "./resistivity-reference-table-br";

function groupFromMaterialName(name: string): ResistivityRefRow["grupo"] {
  const n = name.toLowerCase();
  if (n.includes("água") || n.includes("agua")) return "agua";
  if (n.includes("argila") || n.includes("silte") || n.includes("solo")) return "solo_fino";
  if (n.includes("areia") || n.includes("sediment")) return "sedimento";
  return "rocha";
}

/** Tabela ρ a partir do perfil regional (CPRM/regras/IA). */
export function classificationRowsFromRegional(
  reg: RegionalGeologyProfile,
): ResistivityRefRow[] {
  return [...(reg.materials ?? [])]
    .filter((m) => Number.isFinite(m.rhoMinOhmM) && Number.isFinite(m.rhoMaxOhmM))
    .sort((a, b) => a.rhoMinOhmM - b.rhoMinOhmM)
    .slice(0, 12)
    .map((m, i) => ({
      id: m.id || `reg_${i}`,
      meio: m.nome,
      faixaTexto: `${Math.round(m.rhoMinOhmM)} – ${Math.round(m.rhoMaxOhmM)}`,
      rhoMinOhmM: Math.max(0, Number(m.rhoMinOhmM)),
      rhoMaxOhmM: Math.max(Number(m.rhoMinOhmM), Number(m.rhoMaxOhmM)),
      grupo: groupFromMaterialName(m.nome),
      cor: m.cor || "#94a3b8",
    }));
}
