import {
  Cartesian3,
  Math as CesiumMath,
  type DataSource,
  type Viewer,
} from "cesium";
import type { Cesium3DTileset } from "cesium";

import type { FlyToTarget } from "./types";

export function flyToPosition(viewer: Viewer, target: FlyToTarget): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      target.longitude,
      target.latitude,
      target.height ?? 2500,
    ),
    orientation: {
      heading: CesiumMath.toRadians(target.heading ?? 0),
      pitch: CesiumMath.toRadians(target.pitch ?? -45),
      roll: target.roll ?? 0,
    },
    duration: target.duration ?? 2,
  });
}

export function flyToDataSource(viewer: Viewer, ds: DataSource): void {
  void viewer.flyTo(ds, { duration: 2 });
}

export function flyToTileset(viewer: Viewer, tileset: Cesium3DTileset): void {
  void viewer.flyTo(tileset, { duration: 2 });
}

export function flyToProject(
  viewer: Viewer,
  project: {
    center?: GeoJSON.Point | GeoJSON.Geometry | null;
    boundary?: GeoJSON.Geometry | null;
  },
): void {
  if (project.center && project.center.type === "Point") {
    const [lon, lat] = project.center.coordinates;
    flyToPosition(viewer, { longitude: lon, latitude: lat, height: 12000, pitch: -55 });
    return;
  }
  flyToPosition(viewer, { longitude: -47.75, latitude: -15.75, height: 25000, pitch: -50 });
}
