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

  return (
    <div className="h-[calc(100dvh-7rem)] w-full min-h-0 md:h-[calc(100dvh-4rem)]">
      <div className="relative h-full min-h-0 w-full">
        <Mapa furos={furos} onAddFuro={addFuro} />
      </div>
    </div>
  );
}
