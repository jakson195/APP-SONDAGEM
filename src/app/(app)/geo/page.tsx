"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { GeoMediaHub } from "./components/GeoMediaHub";
import type { FuroMapa } from "./types";

const Mapa = dynamic(() => import("./components/Mapa"), { ssr: false });

type GeoTab = "mapa" | "midia";

function tabClass(active: boolean): string {
  return [
    "rounded-lg px-4 py-2 text-sm font-medium transition",
    active
      ? "bg-[var(--text)] text-[var(--card)] shadow-sm"
      : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
  ].join(" ");
}

export default function GeoPage() {
  const searchParams = useSearchParams();
  const initialTab: GeoTab = searchParams.get("tab") === "midia" ? "midia" : "mapa";
  const [tab, setTab] = useState<GeoTab>(initialTab);

  const [furos, setFuros] = useState<FuroMapa[]>([]);

  const addFuro = useCallback((furo: FuroMapa) => {
    setFuros((prev) => [...prev, furo]);
  }, []);

  const updateFuroPosicao = useCallback((id: string, lat: number, lng: number) => {
    setFuros((prev) => prev.map((f) => (f.id === id ? { ...f, lat, lng } : f)));
  }, []);

  const updateFuroInfo = useCallback((id: string, nome: string, descricao: string) => {
    setFuros((prev) => prev.map((f) => (f.id === id ? { ...f, nome, descricao } : f)));
  }, []);

  const furoCountLabel = useMemo(
    () => (furos.length === 1 ? "1 furo" : `${furos.length} furos`),
    [furos.length],
  );

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-0 w-full flex-col md:h-[calc(100dvh-4rem)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-3 py-2.5 sm:px-4">
        <div>
          <h1 className="text-base font-semibold text-[var(--text)] sm:text-lg">GEO</h1>
          <p className="text-xs text-[var(--muted)]">
            {tab === "mapa"
              ? `Mapa interativo · ${furoCountLabel}`
              : "Fotos, vídeos e frames georreferenciados"}
          </p>
        </div>

        <nav
          className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1"
          aria-label="Secções GEO"
        >
          <button
            type="button"
            className={tabClass(tab === "mapa")}
            aria-pressed={tab === "mapa"}
            onClick={() => setTab("mapa")}
          >
            Mapa e furos
          </button>
          <button
            type="button"
            className={tabClass(tab === "midia")}
            aria-pressed={tab === "midia"}
            onClick={() => setTab("midia")}
          >
            Mídia georreferenciada
          </button>
          <a
            href="/geo/temporal"
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--surface)] hover:text-[var(--text)]"
          >
            Imagens históricas
          </a>
        </nav>
      </header>

      {tab === "mapa" ? (
        <div className="relative min-h-0 flex-1 w-full">
          <Mapa
            furos={furos}
            onAddFuro={addFuro}
            onUpdateFuroPosition={updateFuroPosicao}
            onUpdateFuroInfo={updateFuroInfo}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <GeoMediaHub />
        </div>
      )}
    </div>
  );
}
