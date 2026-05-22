import { HidroChuScClient } from "@/components/hidrochu-sc-client";

export const metadata = {
  title: "HidroChuSC — Chuvas máximas SC | DataGeo Digital",
  description:
    "Análise de chuvas máximas de Santa Catarina — distribuição Gumbel-Chow e períodos de retorno.",
};

export default function HidroChuScPage() {
  return (
    <div className="px-2 pb-8 sm:px-4">
      <HidroChuScClient />
    </div>
  );
}
