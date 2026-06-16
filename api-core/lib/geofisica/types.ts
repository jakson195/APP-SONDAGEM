/**
 * Leitura de campo (SEV Wenner ou Schlumberger): meio-espalhamento corrente AB/2 (= s)
 * e resistividade aparente. Em Schlumberger, MN/2 (b) é fixo na série (definido na UI).
 */
export type LeituraCampoVES = {
  /** Metade da distância entre eléctrodos de corrente AB (m), como em folhas de campo. */
  abHalfM: number;
  /** Resistividade aparente ρa (Ω·m). */
  rhoApparentOhmM: number;
};

/** Leitura SEV Schlumberger com arranjo explícito por linha (AB/2, MN/2 e ρa). */
export type LeituraCampoSchlumberger = {
  abHalfM: number;
  mnHalfM: number;
  rhoApparentOhmM: number;
};

/** Modelo invertido (2 camadas + substrato). */
export type ModeloDuasCamadas = {
  rho1OhmM: number;
  h1M: number;
  rho2OhmM: number;
};

/** Meio em camadas horizontais para SEV Schlumberger (última camada = semi-espaço). */
export type ModeloSchlumbergerCamadas = {
  rhoOhmM: number[];
  hM: number[];
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
