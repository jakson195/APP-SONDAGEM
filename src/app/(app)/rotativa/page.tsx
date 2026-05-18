import { Suspense } from "react";
import {
  CampoSondagemHubClient,
  type CampoSondagemHubConfig,
} from "@/components/campo-sondagem-hub-client";
import { CAMPO_TIPO } from "@/lib/campo-sondagem-tipo";

const hubRotativa: CampoSondagemHubConfig = {
  titulo: "Sondagem rotativa",
  descricao: (
    <>
      Cada registo (<strong className="text-[var(--text)]">SR 01</strong>,{" "}
      <strong className="text-[var(--text)]">SR 02</strong>, …) é um furo na
      obra. Intervalos, cabeçalho do PDF, fotos e localização no mapa ficam
      guardados: use <strong className="text-[var(--text)]">Guardar projeto</strong>{" "}
      na página do registo.
    </>
  ),
  tipo: CAMPO_TIPO.rotativa,
  basePath: "/rotativa",
  listaTitulo: "Registos rotativos desta obra",
  novoRegistoTitulo: "Novo registo rotativo",
  novoRegistoDica:
    "Nome sugerido automaticamente (SR 01, SR 02…); pode alterar antes de criar.",
  placeholderNovo: "ex.: SR 02",
  codigoPrefixo: "SR",
  modoLocalHref: "/rotativa/local",
  modoLocalTexto: "Modo local (sem obra)",
  perfilGeologicoPath: "/rotativa/perfil-geologico",
};

export default function RotativaHubPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--muted)]">A carregar…</div>
      }
    >
      <CampoSondagemHubClient config={hubRotativa} />
    </Suspense>
  );
}
