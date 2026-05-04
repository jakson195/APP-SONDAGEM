import { Suspense } from "react";
import { SptHubClient } from "./spt-hub-client";

export default function SPTPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--muted)]">A carregar…</div>
      }
    >
      <SptHubClient />
    </Suspense>
  );
}
