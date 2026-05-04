type CabecalhoProps = {
  /** Ex.: SPT-01 */
  furoCodigo?: string;
  pagina?: number;
  totalPaginas?: number;
};

export function Cabecalho({
  furoCodigo = "SPT-01",
  pagina = 1,
  totalPaginas = 1,
}: CabecalhoProps) {
  return (
    <div className="mb-2 flex justify-between border border-black p-2 text-[10px]">
      <div>
        <strong>SOILSUL</strong>
        <br />
        Sondagens e Geotecnia
      </div>

      <div className="text-center">
        SONDAGEM DE SIMPLES RECONHECIMENTO COM SPT
        <br />
        ABNT NBR 6484:2020
      </div>

      <div className="text-right">
        {furoCodigo}
        <br />
        Página {pagina}/{totalPaginas}
      </div>
    </div>
  );
}
