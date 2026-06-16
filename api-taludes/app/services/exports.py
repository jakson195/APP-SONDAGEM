"""Exportação GeoJSON, GeoTIFF, LAS, OBJ."""

from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np


def export_geojson_bundle(out_dir: Path, name: str, data: dict) -> Path:
    path = out_dir / "exports" / f"{name}.geojson"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def copy_geotiff(src: Path, out_dir: Path, name: str) -> Path | None:
    if not src.exists():
        return None
    dst = out_dir / "exports" / f"{name}.tif"
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(src.read_bytes())
    return dst


def dsm_to_las_simple(
    dsm: np.ndarray,
    transform,
    out_path: Path,
    subsample: int = 4,
) -> Path:
    """LAS simplificado a partir de DSM (amostragem)."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    h, w = dsm.shape
    points: list[tuple[float, float, float]] = []
    for y in range(0, h, subsample):
        for x in range(0, w, subsample):
            z = float(dsm[y, x])
            if not np.isfinite(z):
                continue
            east, north = transform * (x + 0.5, y + 0.5)
            points.append((east, north, z))
    _write_las_ascii_proxy(out_path, points)
    return out_path


def _write_las_ascii_proxy(path: Path, points: list[tuple[float, float, float]]) -> None:
    """LAS 1.2 mínimo (formato binário simplificado)."""
    if not points:
        path.write_bytes(b"")
        return
    header_size = 375
    offset = header_size
    num_points = len(points)
    buf = bytearray(header_size)
    buf[0:4] = b"LASF"
    buf[24:26] = struct.pack("<H", 1)
    buf[26:28] = struct.pack("<H", 2)
    buf[96:100] = struct.pack("<I", offset)
    buf[100:104] = struct.pack("<I", num_points)
    buf[104:108] = struct.pack("<I", num_points)
    buf[131:139] = struct.pack("<d", points[0][0])
    buf[139:147] = struct.pack("<d", points[0][1])
    buf[147:155] = struct.pack("<d", points[0][2])
    record_format = 0
    record_len = 20
    body = bytearray()
    for i, (x, y, z) in enumerate(points):
        body.extend(struct.pack("<I", i))
        body.extend(struct.pack("<iii", int(x * 100), int(y * 100), int(z * 100)))
    path.write_bytes(bytes(buf) + bytes(body))


def dsm_to_obj_mesh(
    dsm: np.ndarray,
    transform,
    out_path: Path,
    subsample: int = 8,
) -> Path:
    """Malha OBJ grelha regular do DSM."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    h, w = dsm.shape
    verts: list[str] = []
    faces: list[str] = []
    vi = 0
    grid: dict[tuple[int, int], int] = {}
    for y in range(0, h, subsample):
        for x in range(0, w, subsample):
            z = float(dsm[y, x])
            if not np.isfinite(z):
                continue
            east, north = transform * (x + 0.5, y + 0.5)
            vi += 1
            grid[(y, x)] = vi
            verts.append(f"v {east:.3f} {north:.3f} {z:.3f}")
    keys = sorted(grid.keys())
    for i, (y, x) in enumerate(keys):
        if (y, x + subsample) in grid and (y + subsample, x) in grid:
            a, b, c = grid[(y, x)], grid[(y, x + subsample)], grid[(y + subsample, x)]
            faces.append(f"f {a} {b} {c}")
    out_path.write_text(
        "# DataGeo Taludes DSM mesh\n" + "\n".join(verts) + "\n" + "\n".join(faces) + "\n",
        encoding="utf-8",
    )
    return out_path
