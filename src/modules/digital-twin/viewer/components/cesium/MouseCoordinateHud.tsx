"use client";

import { useEffect, useState } from "react";
import {
  Cartographic,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";
import { useCesium } from "../../context/CesiumContext";

/** HUD: longitude / latitude / altitude elipsoidal sob o cursor (terrain world). */
export function MouseCoordinateHud() {
  const { viewer, ready } = useCesium();
  const [label, setLabel] = useState<string>("—");

  useEffect(() => {
    if (!viewer || !ready) return;

    const handler = new ScreenSpaceEventHandler(viewer.canvas);

    handler.setInputAction((movement) => {
      const ellipsoid = viewer.scene.globe.ellipsoid;
      const picked = viewer.camera.pickEllipsoid(movement.endPosition, ellipsoid);
      if (!picked) {
        setLabel("—");
        return;
      }
      const c = Cartographic.fromCartesian(picked);
      const lon = CesiumMath.toDegrees(c.longitude);
      const lat = CesiumMath.toDegrees(c.latitude);
      const h = c.height;
      setLabel(
        `${lon.toFixed(6)}°, ${lat.toFixed(6)}°, alt ${Math.round(h)} m`,
      );
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
    };
  }, [viewer, ready]);

  return (
    <div className="insar-mouse-hud" role="status" aria-live="polite">
      <span className="insar-mouse-hud-label">Cursor WGS84</span>
      <span className="insar-mouse-hud-value">{label}</span>
    </div>
  );
}
