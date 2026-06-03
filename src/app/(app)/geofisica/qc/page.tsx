import { Suspense } from "react";
import { GeophysQcClient } from "./geophys-qc-client";

export const metadata = {
  title: "QC geofísico — DataGeo Digital",
  description:
    "Controlo automático de qualidade: SNR, spikes, FFT, mapa colorido e interpretação IA.",
};

export default function GeofisicaQcPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--muted)]">A carregar…</div>
      }
    >
      <GeophysQcClient />
    </Suspense>
  );
}
