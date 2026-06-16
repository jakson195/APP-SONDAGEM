import { HidroGeoBrasilClient } from "@/components/hidrogeo-brasil-client";

export const metadata = {
  title: "HidroGeo Brasil — Mapa 3D nacional | DataGeo Digital",
  description:
    "Mapa interativo 3D do Brasil com hidrografia ANA, litologia CPRM, medição, exportação e animação de vazão.",
};

export default function HidroGeoBrasilPage() {
  return (
    <div className="px-2 pb-8 sm:px-4">
      <HidroGeoBrasilClient />
    </div>
  );
}
