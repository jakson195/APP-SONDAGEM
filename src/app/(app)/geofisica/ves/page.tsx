import { Suspense } from "react";
import { VesGeofisicaClient } from "./ves-geofisica-client";

export default function GeofisicaVesPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--muted)]">A carregar…</div>
      }
    >
      <VesGeofisicaClient />
    </Suspense>
  );
}
