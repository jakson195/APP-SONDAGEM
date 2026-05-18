import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { createCesiumViewer } from "../../cesium/createViewer";
import { LayerManager } from "../../cesium/LayerManager";
import { useCesium } from "../../context/CesiumContext";

export type CesiumViewerChrome = "default" | "insar_pro";

type Props = {
  /** `insar_pro`: terrain mundo + satélite; fullscreen integrado na toolbar InSAR. */
  chrome?: CesiumViewerChrome;
};

export function CesiumViewer({ chrome = "default" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const { setViewer } = useCesium();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    void (async () => {
      const viewer = await createCesiumViewer(el, {
        chrome: chrome === "insar_pro" ? "insar_pro" : "default",
      });
      if (cancelled) {
        viewer.destroy();
        return;
      }
      viewerRef.current = viewer;
      const manager = new LayerManager(viewer);
      setViewer(viewer, manager);
    })();

    return () => {
      cancelled = true;
      setViewer(null, null);
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [setViewer, chrome]);

  return <div ref={containerRef} className="cesium-container" />;
}
