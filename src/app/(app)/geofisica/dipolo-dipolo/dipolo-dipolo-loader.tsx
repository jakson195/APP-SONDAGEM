"use client";

import dynamic from "next/dynamic";

const DipoloDipoloClient = dynamic(
  () =>
    import("./dipolo-dipolo-client").then((mod) => mod.DipoloDipoloClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 p-6 text-sm text-[var(--muted)]">
        <p>A carregar módulo de inversão…</p>
        <p className="text-xs opacity-80">
          Na primeira vez após reiniciar o servidor, a compilação pode demorar
          ~30 s.
        </p>
      </div>
    ),
  },
);

export function DipoloDipoloLoader() {
  return <DipoloDipoloClient />;
}
