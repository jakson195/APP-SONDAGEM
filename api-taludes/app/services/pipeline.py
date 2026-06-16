"""
Pipeline completo de monitoramento temporal de taludes.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import cv2
import numpy as np
import rasterio
from rasterio.transform import xy
from rasterio.warp import transform as warp_transform

from app.config import settings
from app.services.alignment import align_ecc_affine
from app.services.dsm_diff import compute_dsm_difference
from app.services.exports import (
    copy_geotiff,
    dsm_to_las_simple,
    dsm_to_obj_mesh,
    export_geojson_bundle,
)
from app.services.optical_flow import farneback_flow, flow_to_arrow_grid
from app.services.raster_io import (
    bounds_wgs84,
    normalize_rgb,
    read_pair_rgb,
    write_geotiff,
)
from app.services.risk import classify_risk, risk_score, summarize_risk
from app.services.segmentation import (
    classify_change_type,
    mask_to_polygons_geojson,
    segment_unstable_areas,
)


def detect_change_points(
    diff_norm: np.ndarray,
    flow_mag: np.ndarray | None,
    dsm_diff: np.ndarray | None,
    transform,
    crs,
    threshold: float,
    min_area: int,
    max_points: int,
) -> dict:
    mask = (diff_norm >= threshold).astype(np.uint8) * 255
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    max_val = float(diff_norm.max()) if diff_norm.max() > 0 else 1.0
    max_flow = float(flow_mag.max()) if flow_mag is not None and flow_mag.max() > 0 else 1.0

    candidates: list[tuple[float, dict]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        moments = cv2.moments(contour)
        if moments["m00"] == 0:
            continue
        cx = int(moments["m10"] / moments["m00"])
        cy = int(moments["m01"] / moments["m00"])
        cx = max(0, min(diff_norm.shape[1] - 1, cx))
        cy = max(0, min(diff_norm.shape[0] - 1, cy))
        lon, lat = xy(transform, cx, cy, offset="center")
        if crs and crs.to_epsg() != 4326:
            xs, ys = warp_transform(crs, "EPSG:4326", [lon], [lat])
            lon, lat = xs[0], ys[0]
        intensity = float(diff_norm[cy, cx] / max_val)
        fm = float(flow_mag[cy, cx] / max_flow) if flow_mag is not None else 0.0
        dsm_d = float(dsm_diff[cy, cx]) if dsm_diff is not None else 0.0
        dsm_norm = min(1.0, abs(dsm_d) / 2.0)
        score = risk_score(intensity, fm, dsm_norm, area)
        risk = classify_risk(score)
        tipo = classify_change_type(intensity, fm, dsm_d if dsm_diff is not None else None)
        candidates.append(
            (
                score * area,
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "intensity": round(intensity, 4),
                        "risk": risk,
                        "risk_score": round(score, 4),
                        "tipo": tipo,
                        "flow_mag_px": round(fm * max_flow, 3),
                        "dsm_delta_m": round(dsm_d, 4) if dsm_diff is not None else None,
                        "area_px": round(area, 2),
                    },
                },
            )
        )

    candidates.sort(key=lambda x: x[0], reverse=True)
    return {"type": "FeatureCollection", "features": [f for _, f in candidates[:max_points]]}


def run_analysis(
    ortho_t0: Path,
    ortho_t1: Path,
    out_dir: Path,
    *,
    dsm_t0: Path | None = None,
    dsm_t1: Path | None = None,
    threshold: float = 0.12,
    min_area_px: int = 120,
    max_points: int = 800,
    enable_flow: bool = True,
    enable_dsm: bool = True,
    enable_seg: bool = True,
    max_side: int | None = None,
) -> dict:
    job_id = uuid.uuid4().hex[:12]
    out_dir = out_dir / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    side = max_side or settings.max_compare_side
    t0, t1, transform, crs = read_pair_rgb(ortho_t0, ortho_t1, side)
    t0n = normalize_rgb(t0)
    t1n = normalize_rgb(t1)
    t1n = align_ecc_affine(t0n, t1n)

    diff = np.mean(np.abs(t0n - t1n), axis=2).astype(np.float32)
    diff_norm = diff / (diff.max() + 1e-6)

    flow_mag = None
    vectors_fc: dict = {"type": "FeatureCollection", "features": []}
    if enable_flow:
        flow_mag, flow_ang, _ = farneback_flow(t0n, t1n)
        write_geotiff(out_dir / "flow_magnitude.tif", flow_mag, transform, crs)
        arrows = flow_to_arrow_grid(flow_mag, flow_ang, transform, crs, step=40)
        vectors_fc = {"type": "FeatureCollection", "features": arrows}
        (out_dir / "vectors.geojson").write_text(
            json.dumps(vectors_fc, ensure_ascii=False),
            encoding="utf-8",
        )

    dsm_diff_arr = None
    if enable_dsm and dsm_t0 and dsm_t1 and dsm_t0.exists() and dsm_t1.exists():
        dsm_diff_arr = compute_dsm_difference(
            dsm_t0,
            dsm_t1,
            transform,
            crs,
            diff.shape[0],
            diff.shape[1],
            out_dir / "dsm_diff.tif",
        )

    heat_u8 = (diff_norm * 255).astype(np.uint8)
    heat_color = cv2.applyColorMap(heat_u8, cv2.COLORMAP_TURBO)
    cv2.imwrite(str(out_dir / "heatmap.png"), heat_color)
    write_geotiff(out_dir / "diff.tif", diff, transform, crs)
    write_geotiff(out_dir / "risk_heatmap.tif", diff_norm, transform, crs)

    seg_method = "none"
    seg_geojson: dict = {"type": "FeatureCollection", "features": []}
    if enable_seg:
        mask, seg_method = segment_unstable_areas(diff_norm, t0n, flow_mag)
        write_geotiff(out_dir / "segmentation_mask.tif", mask.astype(np.float32), transform, crs)
        seg_geojson = mask_to_polygons_geojson(mask, transform, crs, min_area_px)
        (out_dir / "segmentation.geojson").write_text(
            json.dumps(seg_geojson, ensure_ascii=False),
            encoding="utf-8",
        )

    points = detect_change_points(
        diff_norm,
        flow_mag,
        dsm_diff_arr,
        transform,
        crs,
        threshold,
        min_area_px,
        max_points,
    )
    (out_dir / "points.geojson").write_text(
        json.dumps(points, ensure_ascii=False),
        encoding="utf-8",
    )

    bounds = bounds_wgs84(transform, crs, diff.shape[0], diff.shape[1])
    risk_summary = summarize_risk(points["features"])

    change_area_pct = float(np.mean(diff_norm >= threshold) * 100)
    max_disp = float(flow_mag.max()) if flow_mag is not None else 0.0
    overall = risk_score(
        float(diff_norm.max()),
        max_disp / (max_disp + 1e-6) if max_disp else 0,
        float(np.abs(dsm_diff_arr).max()) if dsm_diff_arr is not None else 0,
        500,
    )

    exports_dir = out_dir / "exports"
    export_geojson_bundle(out_dir, "points", points)
    export_geojson_bundle(out_dir, "vectors", vectors_fc)
    export_geojson_bundle(out_dir, "segmentation", seg_geojson)
    copy_geotiff(out_dir / "diff.tif", out_dir, "diff")
    copy_geotiff(out_dir / "risk_heatmap.tif", out_dir, "risk_heatmap")
    if dsm_diff_arr is not None:
        copy_geotiff(out_dir / "dsm_diff.tif", out_dir, "dsm_diff")
        dsm_to_las_simple(dsm_diff_arr, transform, exports_dir / "surface.las")
        dsm_to_obj_mesh(dsm_diff_arr, transform, exports_dir / "surface.obj")

    meta = {
        "job_id": job_id,
        "ok": True,
        "bounds": bounds,
        "point_count": len(points["features"]),
        "vector_count": len(vectors_fc["features"]),
        "polygon_count": len(seg_geojson["features"]),
        "risk_summary": risk_summary,
        "overall_risk": classify_risk(overall),
        "overall_score": round(overall, 4),
        "change_area_pct": round(change_area_pct, 2),
        "max_displacement_px": round(max_disp, 3),
        "segmentation_method": seg_method,
        "threshold": threshold,
        "compare_width": diff.shape[1],
        "compare_height": diff.shape[0],
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    outputs = {
        "heatmap": f"/outputs/{job_id}/heatmap.png",
        "diff": f"/outputs/{job_id}/diff.tif",
        "points": f"/outputs/{job_id}/points.geojson",
        "vectors": f"/outputs/{job_id}/vectors.geojson",
        "segmentation": f"/outputs/{job_id}/segmentation.geojson",
        "risk_heatmap": f"/outputs/{job_id}/risk_heatmap.tif",
    }
    if dsm_diff_arr is not None:
        outputs["dsm_diff"] = f"/outputs/{job_id}/dsm_diff.tif"

    return {**meta, "outputs": outputs}
