"use client";

import { useParams } from "next/navigation";
import { TradoRegistroCampo } from "@/components/trado-registro-campo";

export default function TradoPorFuroPage() {
  const params = useParams();
  const furoId = Number(params.furoId as string);

  if (!Number.isFinite(furoId)) {
    return (
      <div className="p-6 text-[var(--text)]">
        <p className="text-red-600 dark:text-red-400">ID do furo inválido.</p>
      </div>
    );
  }

  return <TradoRegistroCampo furoId={furoId} />;
}
