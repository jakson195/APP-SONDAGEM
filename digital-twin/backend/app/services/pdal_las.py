"""Processamento LAS/LAZ com PDAL (subprocess)."""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


class PdalError(RuntimeError):
    pass


def _run(cmd: list[str], *, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise PdalError(
            f"PDAL falhou ({' '.join(cmd)}): {result.stderr or result.stdout}"
        )
    return result


def pdal_available() -> bool:
    try:
        _run([settings.pdal_executable, "--version"])
        return True
    except (PdalError, FileNotFoundError):
        return False


def pdal_info(path: Path) -> dict[str, Any]:
    proc = _run([settings.pdal_executable, "info", str(path), "--summary"])
    return json.loads(proc.stdout)


def bounds_wgs84_from_info(info: dict[str, Any]) -> dict[str, float] | None:
    """Bounds após preprocessamento em EPSG:4326."""
    try:
        bounds = info["summary"]["bounds"]
        return {
            "minx": float(bounds["minx"]),
            "miny": float(bounds["miny"]),
            "maxx": float(bounds["maxx"]),
            "maxy": float(bounds["maxy"]),
            "minz": float(bounds["minz"]) if "minz" in bounds else None,
            "maxz": float(bounds["maxz"]) if "maxz" in bounds else None,
        }
    except (KeyError, TypeError, ValueError):
        return None


def point_count_from_info(info: dict[str, Any]) -> int | None:
    try:
        return int(info["summary"]["num_points"])
    except (KeyError, TypeError, ValueError):
        return None


def build_preprocess_pipeline(
    input_path: Path,
    output_path: Path,
    *,
    source_srs: str | None = None,
    sample_stride: int | None = None,
) -> list[dict[str, Any]]:
    stages: list[dict[str, Any]] = [
        {"type": "readers.las", "filename": str(input_path)},
    ]
    if source_srs:
        stages.append(
            {
                "type": "filters.reprojection",
                "in_srs": source_srs,
                "out_srs": "EPSG:4326",
            }
        )
    else:
        stages.append(
            {
                "type": "filters.reprojection",
                "out_srs": "EPSG:4326",
            }
        )
    if sample_stride and sample_stride > 1:
        stages.append({"type": "filters.sample", "radius": float(sample_stride)})
    stages.append(
        {
            "type": "writers.las",
            "filename": str(output_path),
            "compression": "laszip" if output_path.suffix.lower() == ".laz" else "none",
            "forward": "all",
        }
    )
    return stages


def run_pdal_pipeline(pipeline: list[dict[str, Any]], work_dir: Path) -> None:
    work_dir.mkdir(parents=True, exist_ok=True)
    pipeline_path = work_dir / "pipeline.json"
    pipeline_path.write_text(json.dumps(pipeline), encoding="utf-8")
    _run([settings.pdal_executable, "pipeline", str(pipeline_path)], cwd=work_dir)
    logger.info("PDAL pipeline concluído em %s", work_dir)


def preprocess_las(
    input_path: Path,
    output_path: Path,
    work_dir: Path,
    *,
    sample_stride: int | None = None,
) -> dict[str, Any]:
    info = pdal_info(input_path)
    pipeline = build_preprocess_pipeline(
        input_path,
        output_path,
        sample_stride=sample_stride or settings.pdal_sample_stride,
    )
    run_pdal_pipeline(pipeline, work_dir)
    out_info = pdal_info(output_path) if output_path.exists() else info
    return {
        "input_points": point_count_from_info(info),
        "output_points": point_count_from_info(out_info),
        "bounds": bounds_wgs84_from_info(out_info),
    }
