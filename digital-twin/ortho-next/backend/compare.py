#!/usr/bin/env python3
"""
Compara duas ortofotos GeoTIFF (T0 e T1):
- leitura com downsample para ortofotos grandes
- alinhamento básico (reprojeção + ECC opcional)
- raster de diferença + heatmap
- pontos GeoJSON (limitados) com intensidade e risco
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import rasterio
from rasterio.errors import RasterioIOError
from rasterio.enums import Resampling
from rasterio.transform import Affine, xy
from rasterio.warp import reproject, transform_bounds

MAX_COMPARE_SIDE = 2048
MAX_POINTS = 500
DEFAULT_MIN_AREA = 120


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
        default=DEFAULT_MIN_AREA,
        help="Área mínima de contorno em pixels",
    )
    parser.add_argument(
        "--max-side",
        type=int,
        default=MAX_COMPARE_SIDE,
        help="Maior lado do raster usado na comparação (px)",
    )
    parser.add_argument(
        "--max-points",
        type=int,
        default=MAX_POINTS,
        help="Máximo de pontos no GeoJSON",
    )
    return parser.parse_args()


def _read_rgb_stack(src: rasterio.DatasetReader, out_h: int, out_w: int) -> np.ndarray:
    count = min(3, src.count)
    if count == 1:
        band = src.read(
            1,
            out_shape=(out_h, out_w),
            resampling=Resampling.bilinear,
        ).astype(np.float32)
        return np.repeat(band[:, :, np.newaxis], 3, axis=2)

    data = src.read(
        list(range(1, count + 1)),
        out_shape=(count, out_h, out_w),
        resampling=Resampling.bilinear,
    ).astype(np.float32)
    return np.moveaxis(data, 0, -1)


def read_pair_downsampled(
    t0_path: Path,
    t1_path: Path,
    max_side: int,
) -> tuple[np.ndarray, np.ndarray, rasterio.Affine, rasterio.crs.CRS]:
    try:
        with rasterio.open(t0_path) as t0_src:
            scale = min(1.0, max_side / max(t0_src.height, t0_src.width))
            out_h = max(1, int(round(t0_src.height * scale)))
            out_w = max(1, int(round(t0_src.width * scale)))
            out_transform = t0_src.transform * Affine.scale(
                t0_src.width / out_w,
                t0_src.height / out_h,
            )
            out_crs = t0_src.crs
            t0 = _read_rgb_stack(t0_src, out_h, out_w)

        with rasterio.open(t1_path) as t1_src:
            t1 = np.zeros((out_h, out_w, 3), dtype=np.float32)
            for band_idx in range(3):
                src_band = min(band_idx + 1, t1_src.count)
                reproject(
                    source=rasterio.band(t1_src, src_band),
                    destination=t1[:, :, band_idx],
                    src_transform=t1_src.transform,
                    src_crs=t1_src.crs,
                    dst_transform=out_transform,
                    dst_crs=out_crs,
                    resampling=Resampling.bilinear,
                )
    except RasterioIOError as exc:
        raise RuntimeError(
            "Não foi possível abrir raster TIFF/ECW. Verifique arquivo válido e suporte GDAL/ECW no ambiente."
        ) from exc

    return t0, t1, out_transform, out_crs


def normalize_rgb(stack: np.ndarray) -> np.ndarray:
    out = stack.copy()
    for c in range(3):
        channel = out[:, :, c]
        if np.any(channel > 0):
            p2, p98 = np.percentile(channel[channel > 0], (2, 98))
        else:
            p2, p98 = 0, 1
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
            (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 50, 1e-4),
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
        compress="deflate",
    ) as dst:
        dst.write(data, 1)


def detect_change_points(
    diff: np.ndarray,
    transform: rasterio.Affine,
    crs: rasterio.crs.CRS,
    threshold: float,
    min_area: int,
    max_points: int,
) -> dict:
    mask = (diff >= threshold).astype(np.uint8) * 255
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates: list[tuple[float, dict]] = []
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
        score = intensity * area
        candidates.append(
            (
                score,
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "intensity": round(intensity, 4),
                        "risk": classify_risk(intensity),
                        "area_px": round(area, 2),
                    },
                },
            )
        )

    candidates.sort(key=lambda item: item[0], reverse=True)
    features = [feature for _, feature in candidates[:max_points]]

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

    print(
        json.dumps(
            {
                "status": "reading",
                "maxSide": args.max_side,
                "message": "A ler ortofotos com downsample…",
            }
        ),
        flush=True,
    )

    t0, t1, transform, crs = read_pair_downsampled(t0_path, t1_path, args.max_side)

    t0n = normalize_rgb(t0)
    t1n = normalize_rgb(t1)
    t1n = align_ecc(t0n, t1n)

    diff = np.mean(np.abs(t0n - t1n), axis=2).astype(np.float32)
    diff_norm = diff / (diff.max() + 1e-6)

    heat_u8 = (diff_norm * 255).astype(np.uint8)
    heat_color = cv2.applyColorMap(heat_u8, cv2.COLORMAP_JET)
    heat_rgb = cv2.cvtColor(heat_color, cv2.COLOR_BGR2RGB)

    write_geotiff_single(out_dir / "diff.tif", diff, transform, crs)
    cv2.imwrite(str(out_dir / "heatmap.png"), heat_color)

    geojson = detect_change_points(
        diff_norm,
        transform,
        crs,
        threshold=args.threshold,
        min_area=args.min_area,
        max_points=args.max_points,
    )
    (out_dir / "points.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False),
        encoding="utf-8",
    )

    bounds = raster_bounds_wgs84(transform, crs, diff.shape[0], diff.shape[1])
    meta = {
        "bounds": bounds,
        "pointCount": len(geojson["features"]),
        "threshold": args.threshold,
        "compareWidth": diff.shape[1],
        "compareHeight": diff.shape[0],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    print(json.dumps({"ok": True, **meta}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
