/** Uma leitura de campo (SEV Wenner): meio-espalhamento AB/2 e resistividade aparente. */
export type LeituraCampoVES = {
  /** Metade da distância entre eléctrodos de corrente AB (m), como em folhas de campo. */
  abHalfM: number;
  /** Resistividade aparente ρa (Ω·m). */
  rhoApparentOhmM: number;
};

/** Modelo invertido (2 camadas + substrato). */
export type ModeloDuasCamadas = {
  rho1OhmM: number;
  h1M: number;
  rho2OhmM: number;
};

/**
 * SEV colinear dipolo-dipolo: comprimento de dipolo `a` (m), factor de separação `n` (≥1 inteiro).
 * Geometria: corrente +I em A=0, −I em B=a; potencial em M=(n+1)a, N=(n+2)a.
 */
export type LeituraCampoDipoloDipolo = {
  aM: number;
  n: number;
  rhoApparentOhmM: number;
};
