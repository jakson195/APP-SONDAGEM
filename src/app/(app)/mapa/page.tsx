"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
});

export default function Page() {
  return (
    <div>
      <h1>Mapa</h1>
      <Map />
    </div>
  );
}
