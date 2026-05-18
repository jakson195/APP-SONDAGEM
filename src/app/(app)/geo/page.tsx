"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import type { FuroMapa } from "./types";

const Mapa = dynamic(() => import("./components/Mapa"), { ssr: false });

export default function GeoPage() {
  const [furos, setFuros] = useState<FuroMapa[]>([]);

  const addFuro = useCallback((furo: FuroMapa) => {
    setFuros((prev) => [...prev, furo]);
  }, []);

  const updateFuroPosicao = useCallback((id: string, lat: number, lng: number) => {
    setFuros((prev) =>
      prev.map((f) => (f.id === id ? { ...f, lat, lng } : f)),
    );
  }, []);

  const updateFuroInfo = useCallback((id: string, nome: string, descricao: string) => {
    setFuros((prev) =>
      prev.map((f) => (f.id === id ? { ...f, nome, descricao } : f)),
    );
  }, []);

  return (
    <div className="h-[calc(100dvh-7rem)] w-full min-h-0 md:h-[calc(100dvh-4rem)]">
      <div className="relative h-full min-h-0 w-full">
        <Mapa
          furos={furos}
          onAddFuro={addFuro}
          onUpdateFuroPosition={updateFuroPosicao}
          onUpdateFuroInfo={updateFuroInfo}
        />
      </div>
    </div>
  );
}
