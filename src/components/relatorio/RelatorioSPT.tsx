import { TabelaSPT } from "@/components/relatorio/TabelaSPT";
import { GraficoSPT } from "@/components/relatorio/GraficoSPT";
import { DescricaoSolo } from "@/components/relatorio/DescricaoSolo";

export default function RelatorioSPT() {
  return (
    <div className="bg-white p-4 text-[10px] text-black">
      <div className="border border-gray-400 bg-white p-2 text-center font-bold">
        SONDAGEM DE SIMPLES RECONHECIMENTO COM SPT
        <br />
        ABNT NBR 6484:2020
      </div>

      <div className="mt-2 grid grid-cols-12 border border-gray-400 bg-white">
        <div className="col-span-6 border-r border-gray-400">
          <TabelaSPT />
        </div>

        <div className="col-span-3 border-r border-gray-400">
          <GraficoSPT />
        </div>

        <div className="col-span-3">
          <DescricaoSolo />
        </div>
      </div>
    </div>
  );
}
