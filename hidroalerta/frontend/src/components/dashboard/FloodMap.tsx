import { Layers, MapPin } from "lucide-react";

/** Placeholder Mapbox — substituir com mapbox-gl quando VITE_MAPBOX_TOKEN estiver definido. */
export function FloodMap() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface ring-1 ring-white/5">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Mancha de inundação</h2>
          <p className="text-xs text-muted">HEC-RAS · GeoTIFF COG tiles (Mapbox GL)</p>
        </div>
        <span className="rounded-full bg-attention/15 px-2 py-0.5 text-[10px] font-medium text-attention">
          Simulação activa
        </span>
      </div>

      <div
        className="relative h-80 bg-[#0c1a32]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(30,58,95,0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30,58,95,0.4) 1px, transparent 1px)
          `,
          backgroundSize: "32px 32px",
        }}
      >
        {/* Rio simulado */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 320" preserveAspectRatio="none">
          <path
            d="M0,160 Q200,120 400,155 T800,140 L800,320 L0,320 Z"
            fill="rgba(14,165,233,0.12)"
          />
          <path
            d="M0,160 Q200,120 400,155 T800,140"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            opacity="0.6"
          />
          {/* Mancha inundação */}
          <ellipse cx="420" cy="175" rx="180" ry="55" fill="rgba(239,68,68,0.25)" />
          <ellipse cx="420" cy="175" rx="120" ry="35" fill="rgba(249,115,22,0.35)" />
          <ellipse cx="420" cy="175" rx="60" ry="18" fill="rgba(239,68,68,0.5)" />
        </svg>

        {/* Marcadores estações */}
        {[
          { x: "28%", y: "42%", label: "Blumenau" },
          { x: "52%", y: "48%", label: "Gaspar" },
          { x: "68%", y: "38%", label: "Indaial" },
        ].map((m) => (
          <div
            key={m.label}
            className="absolute flex items-center gap-1"
            style={{ left: m.x, top: m.y }}
          >
            <MapPin className="h-4 w-4 text-water-light drop-shadow" />
            <span className="rounded bg-bg/80 px-1.5 py-0.5 text-[9px] text-slate-300 backdrop-blur">
              {m.label}
            </span>
          </div>
        ))}

        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg border border-border bg-bg/90 px-3 py-2 text-[10px] backdrop-blur">
          <Layers className="h-3.5 w-3.5 text-muted" />
          <span className="text-muted">
            Defina <code className="text-water-light">VITE_MAPBOX_TOKEN</code> para mapa real
          </span>
        </div>

        <div className="absolute bottom-3 right-3 rounded-lg border border-border bg-bg/90 px-2 py-2 backdrop-blur">
          <div className="flex items-center gap-2 text-[9px]">
            <span className="h-2 w-6 rounded bg-danger/60" /> &gt; 1,5 m
            <span className="h-2 w-6 rounded bg-attention/60" /> 0,5–1,5 m
            <span className="h-2 w-6 rounded bg-water/40" /> &lt; 0,5 m
          </div>
        </div>
      </div>
    </div>
  );
}
