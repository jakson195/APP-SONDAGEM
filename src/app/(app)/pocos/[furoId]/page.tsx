"use client";

import { useParams } from "next/navigation";
import { PiezoRegistroCampo } from "@/components/piezo-registro-campo";

export default function PocosPorFuroPage() {
  const params = useParams<{ furoId?: string }>();
  const raw = params?.furoId;
  const furoId = typeof raw === "string" ? Number(raw) : NaN;

  if (!Number.isFinite(furoId)) {
    return (
      <div className="p-6 text-[var(--text)]">
        <p className="text-red-600 dark:text-red-400">ID do furo inválido.</p>
      </div>
    );
  }

  return <PiezoRegistroCampo furoId={furoId} />;
}
