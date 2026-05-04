"use client";

import { useParams } from "next/navigation";
import { SptRegistroCampo } from "@/components/spt-registro-campo";

export default function SptPorFuroPage() {
  const params = useParams();
  const furoId = Number(params.furoId as string);

  if (!Number.isFinite(furoId)) {
    return (
      <div className="p-6 text-[var(--text)]">
        <p className="text-red-600 dark:text-red-400">ID do furo inválido.</p>
      </div>
    );
  }

  return <SptRegistroCampo furoId={furoId} />;
}
