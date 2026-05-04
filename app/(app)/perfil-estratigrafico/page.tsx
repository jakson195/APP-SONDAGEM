"use client";

import SecaoGeologica from "./components/SecaoGeologica";
import type { Furo } from "./types";

export default function Page() {
  const furos: Furo[] = [
    {
      id: "SP01",
      x: 0,
      cotaTerreno: 0,
      nivelAgua: 2,
      camadas: [
        { topo: 0, base: 2, material: "Argila", cor: "#8B4513" },
        { topo: 2, base: 6, material: "Areia", cor: "#f4a460" },
      ],
    },
    {
      id: "SP02",
      x: 40,
      cotaTerreno: -1,
      nivelAgua: 3,
      camadas: [
        { topo: 0, base: 1.5, material: "Argila", cor: "#8B4513" },
        { topo: 1.5, base: 5, material: "Areia", cor: "#f4a460" },
      ],
    },
  ];

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold text-[var(--text)]">
        Perfil Estratigráfico
      </h1>
      <SecaoGeologica furos={furos} />
    </div>
  );
}
