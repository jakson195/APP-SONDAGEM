"use client";

/**
 * Ponto de entrada para mapas Leaflet no Next.js.
 * Não importa `leaflet` / `react-leaflet` aqui — apenas `dynamic(..., { ssr: false })`.
 */

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import type { FieldCampaignMap as FieldCampaignMapType } from "@/components/field-campaign-map";
import type { OsmLeafletMap as OsmLeafletMapType } from "@/components/osm-leaflet-map";
import type { ObraNovaLeafletMap as ObraNovaLeafletMapType } from "@/components/obra-nova/ObraNovaLeafletMap";
import type { ObraAoiLeafletEditor as ObraAoiLeafletEditorType } from "@/components/obra-aoi/ObraAoiLeafletEditor";

export type { FieldFuroPin, FieldMapMode } from "@/components/field-campaign-map-types";

function MapLoading({ label }: { label: string }) {
  return (
    <div
      className="flex min-h-[240px] w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)]"
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}

export const FieldCampaignMap = dynamic(
  () =>
    import("@/components/field-campaign-map").then((m) => ({
      default: m.FieldCampaignMap,
    })),
  {
    ssr: false,
    loading: () => <MapLoading label="A carregar mapa…" />,
  },
);

export const OsmLeafletMap = dynamic(
  () =>
    import("@/components/osm-leaflet-map").then((m) => ({
      default: m.OsmLeafletMap,
    })),
  {
    ssr: false,
    loading: () => <MapLoading label="A carregar mapa…" />,
  },
);

export const ObraNovaLeafletMap = dynamic(
  () =>
    import("@/components/obra-nova/ObraNovaLeafletMap").then((m) => ({
      default: m.ObraNovaLeafletMap,
    })),
  {
    ssr: false,
    loading: () => <MapLoading label="A carregar mapa…" />,
  },
);

export const ObraAoiLeafletEditor = dynamic(
  () =>
    import("@/components/obra-aoi/ObraAoiLeafletEditor").then((m) => ({
      default: m.ObraAoiLeafletEditor,
    })),
  {
    ssr: false,
    loading: () => <MapLoading label="A carregar mapa da área…" />,
  },
);

export type FieldCampaignMapProps = ComponentProps<typeof FieldCampaignMapType>;
export type OsmLeafletMapProps = ComponentProps<typeof OsmLeafletMapType>;
export type ObraNovaLeafletMapProps = ComponentProps<typeof ObraNovaLeafletMapType>;
export type ObraAoiLeafletEditorProps = ComponentProps<typeof ObraAoiLeafletEditorType>;
