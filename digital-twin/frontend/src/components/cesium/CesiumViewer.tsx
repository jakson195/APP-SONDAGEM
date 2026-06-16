import { useEffect, useRef } from "react";
import type { Viewer } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { createCesiumViewer } from "../../cesium/createViewer";
import { LayerManager } from "../../cesium/LayerManager";
import { useCesium } from "../../context/CesiumContext";

export function CesiumViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const { setViewer } = useCesium();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    void (async () => {
      const viewer = await createCesiumViewer(el);
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
  }, [setViewer]);

  return <div ref={containerRef} className="cesium-container" />;
}
