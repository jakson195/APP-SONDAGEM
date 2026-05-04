import { Suspense } from "react";
import {
  CampoSondagemHubClient,
  type CampoSondagemHubConfig,
} from "@/components/campo-sondagem-hub-client";
import { CAMPO_TIPO } from "@/lib/campo-sondagem-tipo";

const hubPiezo: CampoSondagemHubConfig = {
  titulo: "Poços piezométricos / monitoramento",
  descricao: (
    <>
      Cada poço (<strong className="text-[var(--text)]">PZ 01</strong>,{" "}
      <strong className="text-[var(--text)]">PZ 02</strong>, …) é um furo na
      obra. Leituras, instalação, fotos e mapa podem ser guardados com{" "}
      <strong className="text-[var(--text)]">Guardar projeto</strong>.
    </>
  ),
  tipo: CAMPO_TIPO.piezo,
  basePath: "/pocos",
  listaTitulo: "Poços / piezos desta obra",
  novoRegistoTitulo: "Novo poço piezométrico",
  novoRegistoDica:
    "Código sugerido automaticamente; pode alterar antes de criar.",
  placeholderNovo: "ex.: PZ 02",
  codigoPrefixo: "PZ",
  modoLocalHref: "/pocos/local",
  modoLocalTexto: "Modo local (sem obra)",
  mapaCargaHidraulicaPath: "/pocos/mapa-carga-hidraulica",
};

export default function PocosHubPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--muted)]">A carregar…</div>
      }
    >
      <CampoSondagemHubClient config={hubPiezo} />
    </Suspense>
  );
}
