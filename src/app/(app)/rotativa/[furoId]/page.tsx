"use client";

import { useParams } from "next/navigation";
import { RotativaRegistroCampo } from "@/components/rotativa-registro-campo";

export default function RotativaPorFuroPage() {
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

  return <RotativaRegistroCampo furoId={furoId} />;
}
