/** Uma linha da folha SOLODATA tipo «LINHA 12» (dipolo-dipolo). */
export type SolodataLinhaRow = {
  medida: number | null;
  piquete: number | null;
  espM: number | null;
  a: number | null;
  b: number | null;
  m: number | null;
  nEl: number | null;
  nivel: number | null;
  /** Entrada (vermelho na folha): SP (mV). */
  spMv: number | null;
  /** Entrada: V (mV). */
  vMv: number | null;
  /** Entrada: i (mA). */
  iMa: number | null;
  g: number | null;
  k: number | null;
  rapCalc: number | null;
  a2: number | null;
  b2: number | null;
  m2: number | null;
  n2: number | null;
  /** Entrada: distância ao longo do perfil (m). */
  dist: number | null;
  /** Entrada: espaçamento / dipolo a (m). */
  esp: number | null;
  /** Entrada: factor n. */
  nSep: number | null;
  /** Entrada: ρa (Ω·m) para inversão 2D. */
  rap: number | null;
  /** Cota do terreno na estação (m) — opcional, para topografia do perfil. */
  cota?: number | null;
  /** Excluir da inversão / pseudoseção ativa (ruído). */
  excluded?: boolean;
};

export type SolodataLinhaMeta = {
  titulo: string;
  linha: string;
};

export type SolodataLinhaState = {
  meta: SolodataLinhaMeta;
  rows: SolodataLinhaRow[];
};

export function emptySolodataLinhaRow(medida = 1): SolodataLinhaRow {
  return {
    medida,
    piquete: 1,
    espM: 15,
    a: null,
    b: null,
    m: null,
    nEl: null,
    nivel: null,
    spMv: null,
    vMv: null,
    iMa: null,
    g: null,
    k: null,
    rapCalc: null,
    a2: null,
    b2: null,
    m2: null,
    n2: null,
    dist: null,
    esp: 15,
    nSep: null,
    rap: null,
    cota: null,
    excluded: false,
  };
}

export function defaultSolodataLinhaState(rowCount = 91): SolodataLinhaState {
  return {
    meta: { titulo: "Geofísica — (01)", linha: "12" },
    rows: Array.from({ length: rowCount }, (_, i) =>
      emptySolodataLinhaRow(i + 1),
    ),
  };
}
