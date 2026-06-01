import { Suspense } from "react";
import { Volume3DClient } from "./volume-3d-client";

export default function Volume3DPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--muted)]">A carregar…</div>
      }
    >
      <Volume3DClient />
    </Suspense>
  );
}
