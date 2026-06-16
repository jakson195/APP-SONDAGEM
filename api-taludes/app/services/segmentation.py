"""Segmentação de áreas instáveis — U-Net (opcional) + fallback OpenCV."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from app.config import settings


def _classical_unstable_mask(diff_norm: np.ndarray, flow_mag: np.ndarray | None) -> np.ndarray:
    """Máscara binária de instabilidade sem rede neural."""
    d = (diff_norm >= 0.15).astype(np.uint8)
    if flow_mag is not None:
        fm = flow_mag / (flow_mag.max() + 1e-6)
        d = np.maximum(d, (fm >= 0.2).astype(np.uint8))
    kernel = np.ones((7, 7), np.uint8)
    d = cv2.morphologyEx(d * 255, cv2.MORPH_CLOSE, kernel)
    d = cv2.morphologyEx(d, cv2.MORPH_OPEN, kernel)
    return (d > 127).astype(np.uint8)


def _try_unet_mask(rgb: np.ndarray) -> np.ndarray | None:
    weights = settings.unet_weights_path
    if not weights or not Path(weights).exists():
        return None
    try:
        import torch  # noqa: PLC0415

        # Placeholder: carregar U-Net treinada para taludes
        # model = load_unet(weights); return model.predict(rgb)
        _ = torch
        return None
    except ImportError:
        return None


def segment_unstable_areas(
    diff_norm: np.ndarray,
    ref_rgb: np.ndarray,
    flow_mag: np.ndarray | None = None,
) -> tuple[np.ndarray, str]:
    """
    Retorna (máscara 0/1, método).
    """
    unet = _try_unet_mask(ref_rgb)
    if unet is not None:
        return unet, "unet"
    return _classical_unstable_mask(diff_norm, flow_mag), "classical_cv"


def mask_to_polygons_geojson(
    mask: np.ndarray,
    transform,
    crs,
    min_area: int = 80,
) -> dict:
    from rasterio.transform import xy
    from rasterio.warp import transform as warp_transform

    contours, _ = cv2.findContours(
        (mask * 255).astype(np.uint8),
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    features: list[dict] = []
    for cnt in contours:
        if cv2.contourArea(cnt) < min_area:
            continue
        coords_px = cnt.squeeze()
        if coords_px.ndim != 2 or len(coords_px) < 3:
            continue
        ring: list[list[float]] = []
        for px in coords_px:
            x, y = int(px[0]), int(px[1])
            lon, lat = xy(transform, x, y, offset="center")
            if crs and crs.to_epsg() != 4326:
                xs, ys = warp_transform(crs, "EPSG:4326", [lon], [lat])
                lon, lat = xs[0], ys[0]
            ring.append([lon, lat])
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        area = cv2.contourArea(cnt)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "area_px": round(float(area), 1),
                    "tipo": "instabilidade",
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def classify_change_type(
    diff_val: float,
    flow_mag: float,
    dsm_delta: float | None,
) -> str:
    if dsm_delta is not None and abs(dsm_delta) > 0.15:
        if dsm_delta < -0.1:
            return "erosao"
        return "deslocamento"
    if flow_mag > 2.0:
        return "deslocamento"
    if diff_val > 0.5:
        return "trinca"
    if diff_val > 0.35:
        return "instabilidade"
    return "geral"
