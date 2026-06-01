import { HidroChuBrClient } from "@/components/hidrochu-br-client";

export const metadata = {
  title: "HidroBrasil — Hidrologia nacional | DataGeo Digital",
  description:
    "Cálculos hidrológicos em nível Brasil, importação ANA e previsão de enchentes por IA.",
};

export default function HidroChuBrPage() {
  return (
    <div className="px-2 pb-8 sm:px-4">
      <HidroChuBrClient />
    </div>
  );
}
