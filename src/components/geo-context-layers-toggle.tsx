"use client";

import {
  MAP_CONTEXT_LAYERS,
  MAP_CONTEXT_LAYER_GROUPS,
  contextLayersByGroup,
  type MapContextLayerGroup,
} from "@/lib/geofisica/geodata/map-context-layers";

type Props = {
  activeIds: Set<string>;
  onToggle: (id: string) => void;
  className?: string;
  compact?: boolean;
};

const GROUP_ORDER: MapContextLayerGroup[] = [
  "geologia",
  "hidrografia",
  "topografia",
  "geofisica",
];

export function GeoContextLayersToggle({
  activeIds,
  onToggle,
  className = "",
  compact = false,
}: Props) {
  const byGroup = contextLayersByGroup();

  if (compact) {
    return (
      <div className={`flex flex-wrap gap-1 ${className}`}>
        {MAP_CONTEXT_LAYERS.map((layer) => (
          <label
            key={layer.id}
            className="flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:bg-teal-600/10"
          >
            <input
              type="checkbox"
              className="h-3 w-3 accent-teal-600"
              checked={activeIds.has(layer.id)}
              onChange={() => onToggle(layer.id)}
            />
            {layer.label}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {GROUP_ORDER.map((group) => {
        const layers = byGroup[group];
        if (layers.length === 0) return null;
        return (
          <div key={group}>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
              {MAP_CONTEXT_LAYER_GROUPS[group]}
            </p>
            <div className="flex flex-wrap gap-1">
              {layers.map((layer) => (
                <label
                  key={layer.id}
                  className="flex cursor-pointer items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:bg-teal-600/10"
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-teal-600"
                    checked={activeIds.has(layer.id)}
                    onChange={() => onToggle(layer.id)}
                  />
                  {layer.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <p className="text-[9px] text-[var(--muted)]">
        Geologia: CPRM GeoSGB (WMS) · Elevação: OpenTopography (GeoTIFF) + hillshade
        preview · Imagem: Planetary Computer STAC.
      </p>
    </div>
  );
}
