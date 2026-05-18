import { Suspense } from "react";
import {
  CampoSondagemHubClient,
  type CampoSondagemHubConfig,
} from "@/components/campo-sondagem-hub-client";
import { CAMPO_TIPO } from "@/lib/campo-sondagem-tipo";

const hubTrado: CampoSondagemHubConfig = {
  titulo: "Sondagem a trado",
  descricao: (
    <>
      Cada registo (<strong className="text-[var(--text)]">ST 01</strong>,{" "}
      <strong className="text-[var(--text)]">ST 02</strong>, …) é um furo na
      obra. Intervalos, PDF, fotos e posição no mapa podem ser guardados com{" "}
      <strong className="text-[var(--text)]">Guardar projeto</strong>.
    </>
  ),
  tipo: CAMPO_TIPO.trado,
  basePath: "/trado",
  listaTitulo: "Registos a trado desta obra",
  novoRegistoTitulo: "Novo registo a trado",
  novoRegistoDica:
    "Nome sugerido automaticamente; pode alterar antes de criar.",
  placeholderNovo: "ex.: ST 02",
  codigoPrefixo: "ST",
  modoLocalHref: "/trado/local",
  modoLocalTexto: "Modo local (sem obra)",
};

export default function TradoHubPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--muted)]">A carregar…</div>
      }
    >
      <CampoSondagemHubClient config={hubTrado} />
    </Suspense>
  );
}
