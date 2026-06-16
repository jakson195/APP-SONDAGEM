import { LeilaoANMClient } from "@/components/leilao-anm-client";

export const metadata = {
  title: "ANM · Leilão SOPLE | DataGeo Digital",
  description: "Áreas minerárias ANM SIGMINE com rodadas de leilão SOPLE no mapa nacional.",
};

export default function LeilaoANMPage() {
  return (
    <div className="px-2 pb-8 sm:px-4">
      <LeilaoANMClient />
    </div>
  );
}
