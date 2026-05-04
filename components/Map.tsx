"use client";

import { OsmLeafletMap } from "@/components/osm-leaflet-map";

export default function Map() {
  return (
    <OsmLeafletMap className="h-[70vh] w-full min-h-[280px] rounded-lg border border-[var(--border)] shadow-sm" />
  );
}
