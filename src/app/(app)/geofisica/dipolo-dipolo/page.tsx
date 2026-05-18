import { Suspense } from "react";
import { DipoloDipoloClient } from "./dipolo-dipolo-client";

export default function DipoloDipoloPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--muted)]">A carregar…</div>
      }
    >
      <DipoloDipoloClient />
    </Suspense>
  );
}
