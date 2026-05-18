"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect } from "react";
import { ModuleSuspenseFallback } from "@/layouts/module-suspense";
import "@/modules/digital-twin/viewer/App.css";

const DigitalTwinView = dynamic(
  () =>
    import("@/modules/digital-twin/viewer/components/DigitalTwinView").then(
      (m) => ({ default: m.DigitalTwinView }),
    ),
  { ssr: false, loading: () => <ModuleSuspenseFallback label="A iniciar Cesium…" /> },
);

type Props = {
  mode?: "full" | "insar" | "lidar";
};

function useCesiumBaseUrl() {
  useEffect(() => {
    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL =
      "/cesium/";
  }, []);
}

export function CesiumRouteShell({ mode = "full" }: Props) {
  useCesiumBaseUrl();

  return (
    <Suspense fallback={<ModuleSuspenseFallback label="A carregar mapa 3D…" />}>
      <div className="digital-twin-cesium-root" data-viewer-mode={mode}>
        <DigitalTwinView viewerMode={mode} />
      </div>
    </Suspense>
  );
}
