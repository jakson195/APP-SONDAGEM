#!/usr/bin/env python3
"""
Compara duas ortofotos GeoTIFF (T0 e T1):
- alinhamento básico (reprojeção + redimensionamento + ECC opcional)
- raster de diferença
- heatmap de mudanças
- pontos GeoJSON com intensidade e risco
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import xy
from rasterio.warp import calculate_default_transform, reproject


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Comparar ortofotos T0 e T1")
    parser.add_argument("--t0", required=True, help="Caminho GeoTIFF T0")
    parser.add_argument("--t1", required=True, help="Caminho GeoTIFF T1")
    parser.add_argument("--out", required=True, help="Pasta de saída")
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.12,
        help="Limiar normalizado (0-1) para máscara de mudança",
    )
    parser.add_argument(
        "--min-area",
        type=int,
        default=80,
        help="Área mínima de contorno em pixels",
    )
    return parser.parse_args()


def read_rgb_array(path: Path) -> tuple[np.ndarray, rasterio.Affine, rasterio.crs.CRS]:
    with rasterio.open(path) as src:
        count = min(3, src.count)
        bands = [src.read(i + 1).astype(np.float32) for i in range(count)]
        if len(bands) == 1:
            stack = np.repeat(bands[0][:, :, np.newaxis], 3, axis=2)
        else:
            stack = np.stack(bands, axis=-1)
        return stack, src.transform, src.crs


def reproject_to_match(
    source_path: Path,
    ref_path: Path,
) -> tuple[np.ndarray, rasterio.Affine, rasterio.crs.CRS]:
    with rasterio.open(ref_path) as ref, rasterio.open(source_path) as src:
        if (
            src.crs == ref.crs
            and src.width == ref.width
            and src.height == ref.height
            and src.transform == ref.transform
        ):
            count = min(3, src.count)
            bands = [src.read(i + 1).astype(np.float32) for i in range(count)]
            if len(bands) == 1:
                stack = np.repeat(bands[0][:, :, np.newaxis], 3, axis=2)
            else:
                stack = np.stack(bands, axis=-1)
            return stack, ref.transform, ref.crs

        dst = np.zeros((ref.height, ref.width, 3), dtype=np.float32)
        for band_idx in range(min(3, src.count)):
            reproject(
                source=rasterio.band(src, band_idx + 1),
                destination=dst[:, :, band_idx],
                src_transform=src.transform,
                src_crs=src.crs,
                dst_transform=ref.transform,
                dst_crs=ref.crs,
                resampling=Resampling.bilinear,
            )
        if src.count == 1:
            dst[:, :, 1] = dst[:, :, 0]
            dst[:, :, 2] = dst[:, :, 0]
        return dst, ref.transform, ref.crs


def normalize_rgb(stack: np.ndarray) -> np.ndarray:
    out = stack.copy()
    for c in range(3):
        channel = out[:, :, c]
        p2, p98 = np.percentile(channel[channel > 0], (2, 98)) if np.any(channel > 0) else (0, 1)
        if p98 <= p2:
            p98 = p2 + 1
        out[:, :, c] = np.clip((channel - p2) / (p98 - p2), 0, 1)
    return out


def align_ecc(reference: np.ndarray, moving: np.ndarray) -> np.ndarray:
    ref_gray = cv2.cvtColor((reference * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    mov_gray = cv2.cvtColor((moving * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(
            ref_gray,
            mov_gray,
            warp,
            cv2.MOTION_AFFINE,
            (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-5),
        )
        h, w = ref_gray.shape
        aligned = cv2.warpAffine(
            (moving * 255).astype(np.uint8),
            warp,
            (w, h),
            flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
        )
        return aligned.astype(np.float32) / 255.0
    except cv2.error:
        return moving


def classify_risk(intensity: float) -> str:
    if intensity >= 0.75:
        return "alto"
    if intensity >= 0.45:
        return "medio"
    return "baixo"


def raster_bounds_wgs84(
    transform: rasterio.Affine,
    crs: rasterio.crs.CRS,
    height: int,
    width: int,
) -> list[float]:
    from rasterio.warp import transform_bounds

    bounds = rasterio.transform.array_bounds(height, width, transform)
    west, south, east, north = transform_bounds(crs, "EPSG:4326", *bounds)
    return [west, south, east, north]


def write_geotiff_single(path: Path, data: np.ndarray, transform, crs) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype=data.dtype,
        crs=crs,
        transform=transform,
    ) as dst:
        dst.write(data, 1)


def write_geotiff_rgb(path: Path, rgb: np.ndarray, transform, crs) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=rgb.shape[0],
        width=rgb.shape[1],
        count=3,
        dtype=np.uint8,
        crs=crs,
        transform=transform,
    ) as dst:
        for i in range(3):
            dst.write(rgb[:, :, i], i + 1)


def detect_change_points(
    diff: np.ndarray,
    transform: rasterio.Affine,
    crs: rasterio.crs.CRS,
    threshold: float,
    min_area: int,
) -> dict:
    mask = (diff >= threshold).astype(np.uint8) * 255
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    features = []
    max_val = float(diff.max()) if diff.max() > 0 else 1.0

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        moments = cv2.moments(contour)
        if moments["m00"] == 0:
            continue
        cx = int(moments["m10"] / moments["m00"])
        cy = int(moments["m01"] / moments["m00"])
        cx = max(0, min(diff.shape[1] - 1, cx))
        cy = max(0, min(diff.shape[0] - 1, cy))
        lon, lat = xy(transform, cx, cy, offset="center")
        if crs and crs.to_epsg() != 4326:
            from rasterio.warp import transform as warp_transform

            xs, ys = warp_transform(crs, "EPSG:4326", [lon], [lat])
            lon, lat = xs[0], ys[0]

        intensity = float(diff[cy, cx] / max_val)
        risk = classify_risk(intensity)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": {
                    "intensity": round(intensity, 4),
                    "risk": risk,
                    "area_px": round(area, 2),
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def main() -> int:
    args = parse_args()
    t0_path = Path(args.t0)
    t1_path = Path(args.t1)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not t0_path.exists() or not t1_path.exists():
        print("Arquivos T0/T1 não encontrados.", file=sys.stderr)
        return 1

    t0, transform, crs = read_rgb_array(t0_path)
    t1, _, _ = reproject_to_match(t1_path, t0_path)

    if t1.shape[:2] != t0.shape[:2]:
        t1 = cv2.resize(t1, (t0.shape[1], t0.shape[0]), interpolation=cv2.INTER_LINEAR)

    t0n = normalize_rgb(t0)
    t1n = normalize_rgb(t1)
    t1n = align_ecc(t0n, t1n)

    diff = np.mean(np.abs(t0n - t1n), axis=2).astype(np.float32)
    diff_norm = diff / (diff.max() + 1e-6)

    heat_u8 = (diff_norm * 255).astype(np.uint8)
    heat_color = cv2.applyColorMap(heat_u8, cv2.COLORMAP_JET)
    heat_rgb = cv2.cvtColor(heat_color, cv2.COLOR_BGR2RGB)

    write_geotiff_single(out_dir / "diff.tif", diff, transform, crs)
    write_geotiff_rgb(out_dir / "heatmap.tif", heat_rgb, transform, crs)
    cv2.imwrite(str(out_dir / "heatmap.png"), heat_color)

    geojson = detect_change_points(
        diff_norm,
        transform,
        crs,
        threshold=args.threshold,
        min_area=args.min_area,
    )
    (out_dir / "points.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    bounds = raster_bounds_wgs84(transform, crs, diff.shape[0], diff.shape[1])
    meta = {
        "bounds": bounds,
        "pointCount": len(geojson["features"]),
        "threshold": args.threshold,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, **meta}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
