import type { Metadata } from "next";

import { NovaObraInsarClient } from "@/components/obra-nova/NovaObraInsarClient";

export const metadata: Metadata = {
  title: "Nova obra · InSAR",
  description:
    "Criar obra com área de interesse georreferenciada e iniciar o projeto InSAR.",
};

export default function NovaObraInsarRoutePage() {
  return <NovaObraInsarClient />;
}
