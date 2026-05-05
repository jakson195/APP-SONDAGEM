"use client";

import { useParams } from "next/navigation";

export default function TradoPorFuroPage() {
  const params = useParams();
  const furoId = Number(params.furoId as string);

  if (!Number.isFinite(furoId)) {
    return (
      <div className="p-6 text-[var(--text)]">
        <p className="text-red-600 dark:text-red-400">ID do furo invalido.</p>
      </div>
    );
  }

  return (
    <div className="p-6 text-[var(--text)]">
      <h1 className="text-2xl font-semibold">Sondagem Trado</h1>
      <p className="mt-2 text-[var(--muted)]">
        O registro do furo {furoId} foi desativado temporariamente.
      </p>
    </div>
  );
}