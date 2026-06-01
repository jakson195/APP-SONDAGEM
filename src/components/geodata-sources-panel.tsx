"use client";

import {
  DATAGEO_RECOMMENDED_SOURCES,
  type DatageoSourceDef,
} from "@/lib/geodata/datageo-sources";

type Props = {
  className?: string;
  compact?: boolean;
};

function SourceCard({ s, compact }: { s: DatageoSourceDef; compact: boolean }) {
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border border-[var(--border)] p-2 transition hover:border-teal-600/50 hover:bg-teal-600/5"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-teal-700 dark:text-teal-400">
        {s.role}
      </p>
      <p className="text-xs font-semibold text-[var(--text)]">{s.label}</p>
      {!compact && (
        <p className="mt-0.5 line-clamp-2 text-[10px] text-[var(--muted)]">
          {s.description}
        </p>
      )}
      <p className="mt-1 text-[9px] text-[var(--muted)]">
        {s.products.slice(0, 3).join(" · ")}
      </p>
    </a>
  );
}

export function GeodataSourcesPanel({ className = "", compact = false }: Props) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 ${className}`}
    >
      <p className="mb-2 text-xs font-medium">Fontes recomendadas (DataGeo)</p>
      {!compact && (
        <p className="mb-2 text-[10px] text-[var(--muted)]">
          Imagem histórica: Planetary Computer · Geologia: CPRM GeoSGB · Elevação:
          OpenTopography · Sentinel: Copernicus Browser.
        </p>
      )}
      <div
        className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}
      >
        {DATAGEO_RECOMMENDED_SOURCES.map((s) => (
          <SourceCard key={s.id} s={s} compact={compact} />
        ))}
      </div>
    </div>
  );
}
