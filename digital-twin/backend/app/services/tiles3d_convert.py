"""Conversão LAS processado → 3D Tiles (py3dtiles)."""

from __future__ import annotations

import logging
import shutil
import subprocess
import sys
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


class Tiles3DError(RuntimeError):
    pass


def py3dtiles_available() -> bool:
    try:
        import py3dtiles  # noqa: F401

        return True
    except ImportError:
        return False


def _find_tileset_json(output_dir: Path) -> Path:
    tileset = output_dir / "tileset.json"
    if tileset.exists():
        return tileset
    candidates = list(output_dir.rglob("tileset.json"))
    if not candidates:
        raise Tiles3DError("tileset.json não gerado")
    if candidates[0].parent != output_dir:
        for item in candidates[0].parent.iterdir():
            dest = output_dir / item.name
            if dest.exists():
                if dest.is_dir():
                    shutil.rmtree(dest)
                else:
                    dest.unlink()
            shutil.move(str(item), str(dest))
    return output_dir / "tileset.json"


def las_to_3d_tiles(las_path: Path, output_dir: Path) -> Path:
    """Gera tileset 3D Tiles (pnts) a partir de LAS/LAZ."""
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        from py3dtiles.convert import convert as py3d_convert

        logger.info("py3dtiles API: %s -> %s", las_path, output_dir)
        py3d_convert(
            files=[str(las_path)],
            outfolder=str(output_dir),
            overwrite=True,
            crs_out=settings.tiles3d_srs_out,
        )
        return _find_tileset_json(output_dir)
    except ImportError:
        pass
    except Exception as exc:
        logger.warning("py3dtiles API falhou, tentando CLI: %s", exc)

    cmd = [
        sys.executable,
        "-m",
        "py3dtiles",
        "convert",
        str(las_path),
        str(output_dir),
        "--overwrite",
    ]
    if settings.tiles3d_srs_out:
        cmd.extend(["--crs_out", settings.tiles3d_srs_out])

    logger.info("py3dtiles CLI: %s", " ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise Tiles3DError(
            f"py3dtiles falhou: {proc.stderr or proc.stdout or proc.returncode}"
        )

    return _find_tileset_json(output_dir)
