import type { Furo } from "../perfil-estratigrafico/types";
import type { FuroMapa } from "./types";

/** Converte pontos do mapa em `Furo` para `SecaoGeologica` (x em m ao longo do perfil). */
export function furosMapaParaPerfil(pontos: FuroMapa[]): Furo[] {
  return pontos.map((p, i) => ({
    id: p.id,
    x: i * 40,
    cotaTerreno: 0,
    camadas:
      Array.isArray(p.camadas) && p.camadas.length > 0
        ? (p.camadas as Furo["camadas"])
        : [
            {
              topo: 0,
              base: 1,
              material: "Ponto mapa",
              cor: "#94a3b8",
            },
          ],
  }));
}
