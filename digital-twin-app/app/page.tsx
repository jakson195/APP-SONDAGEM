import type { Metadata } from "next";

import { DigitalTwinWorkspace } from "@/components/DigitalTwinWorkspace";

export const metadata: Metadata = {
  title: "Digital Twin · Ortofotos",
  description: "Comparação temporal T0/T1 com Mapbox, heatmap e detecção de mudanças.",
};

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 px-4 py-3 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Digital Twin</h1>
        <p className="text-xs text-slate-400 sm:text-sm">
          Ortofotos T0/T1 · heatmap · pontos de risco · slider before/after
        </p>
      </header>
      <DigitalTwinWorkspace />
    </div>
  );
}
