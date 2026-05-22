import type { HidroChuEstacao } from "@/lib/hidrochu/types";

export type EstacaoScDemo = HidroChuEstacao & {
  id: string;
  nDados: number;
  falhas: number;
  numero: number;
  lat: number;
  lng: number;
};

/** Estações de exemplo (metadados ANA / HidroChuSC). */
export const ESTACOES_SC_DEMO: EstacaoScDemo[] = [
  {
    id: "02652000",
    codigo: "02652000",
    nome: "Abelardo Luz",
    municipio: "Abelardo Luz",
    latitude: "26°33'22\"",
    longitude: "52°19'51\"",
    altitude: 760,
    fonte: "ANA",
    anoInicial: 1958,
    anoFinal: 2011,
    nDados: 52,
    falhas: 2,
    numero: 69,
    lat: -26.556,
    lng: -52.331,
  },
  {
    id: "02849024",
    codigo: "02849024",
    nome: "Foz do Manuel Alves",
    municipio: "Meleiro",
    latitude: "28°51'13\"",
    longitude: "49°35'23\"",
    altitude: 15,
    fonte: "ANA",
    anoInicial: 1978,
    anoFinal: 2011,
    nDados: 33,
    falhas: 1,
    numero: 5,
    lat: -28.854,
    lng: -49.59,
  },
  {
    id: "02748016",
    codigo: "02748016",
    nome: "Antônio Carlos",
    municipio: "Antônio Carlos",
    latitude: "27°31'01\"",
    longitude: "48°46'10\"",
    altitude: 34,
    fonte: "ANA",
    anoInicial: 1977,
    anoFinal: 2011,
    nDados: 35,
    falhas: 0,
    numero: 5,
    lat: -27.517,
    lng: -48.769,
  },
];

/** Fallback quando o catálogo EPAGRI ainda não foi carregado no cliente. */
export function municipiosScDemo(): string[] {
  return [...new Set(ESTACOES_SC_DEMO.map((e) => e.municipio))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}
