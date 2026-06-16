"""Optical Flow Farneback entre ortofotos alinhadas."""

from __future__ import annotations

import cv2
import numpy as np


def farneback_flow(
    ref_rgb: np.ndarray,
    mov_rgb: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Retorna (magnitude, angulo_rad, flow_uv).
    flow_uv shape (H, W, 2) em pixels.
    """
    ref_g = cv2.cvtColor((ref_rgb * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    mov_g = cv2.cvtColor((mov_rgb * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    flow = cv2.calcOpticalFlowFarneback(
        ref_g,
        mov_g,
        None,
        pyr_scale=0.5,
        levels=4,
        winsize=21,
        iterations=5,
        poly_n=7,
        poly_sigma=1.5,
        flags=0,
    )
    mag, ang = cv2.cartToPolar(flow[..., 0], flow[..., 1])
    return mag.astype(np.float32), ang.astype(np.float32), flow


def flow_to_arrow_grid(
    mag: np.ndarray,
    ang: np.ndarray,
    transform,
    crs,
    step: int = 32,
    min_mag: float = 0.5,
) -> list[dict]:
    """Gera features GeoJSON LineString para vetores de deslocamento."""
    from rasterio.transform import xy
    from rasterio.warp import transform as warp_transform

    features: list[dict] = []
    h, w = mag.shape
    for y in range(step // 2, h, step):
        for x in range(step // 2, w, step):
            m = float(mag[y, x])
            if m < min_mag:
                continue
            a = float(ang[y, x])
            dx = m * np.cos(a)
            dy = m * np.sin(a)
            x1, y1 = x, y
            x2 = int(np.clip(x + dx, 0, w - 1))
            y2 = int(np.clip(y + dy, 0, h - 1))
            lon1, lat1 = xy(transform, x1, y1, offset="center")
            lon2, lat2 = xy(transform, x2, y2, offset="center")
            if crs and crs.to_epsg() != 4326:
                xs, ys = warp_transform(crs, "EPSG:4326", [lon1, lon2], [lat1, lat2])
                lon1, lon2, lat1, lat2 = xs[0], xs[1], ys[0], ys[1]
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[lon1, lat1], [lon2, lat2]],
                    },
                    "properties": {
                        "magnitude_px": round(m, 3),
                        "tipo": "deslocamento",
                    },
                }
            )
    return features
