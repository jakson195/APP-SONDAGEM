"""ECW → GeoTIFF quando o driver GDAL/ECW não está disponível."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def convert_ecw_to_geotiff(src: Path, dst: Path, timeout_sec: int = 1800) -> None:
    if not src.is_file():
        raise RuntimeError(f"Ficheiro ECW não encontrado: {src}")

    errors: list[str] = []

    npx = shutil.which("npx")
    if npx:
        try:
            subprocess.run(
                [npx, "--yes", "ecw2tiff", str(src), str(dst)],
                check=True,
                capture_output=True,
                timeout=timeout_sec,
                shell=(Path(npx).suffix.lower() in {".cmd", ".exe"}),
            )
            if dst.is_file() and dst.stat().st_size > 0:
                return
            errors.append("ecw2tiff não gerou ficheiro de saída.")
        except subprocess.CalledProcessError as exc:
            err = (exc.stderr or exc.stdout or b"").decode(errors="replace")
            errors.append(f"ecw2tiff: {err[:400]}")
        except subprocess.TimeoutExpired:
            errors.append("ecw2tiff: tempo limite excedido na conversão.")

    gdal = shutil.which("gdal_translate")
    if gdal:
        try:
            subprocess.run(
                [gdal, "-of", "GTiff", "-co", "COMPRESS=DEFLATE", str(src), str(dst)],
                check=True,
                capture_output=True,
                timeout=timeout_sec,
            )
            if dst.is_file() and dst.stat().st_size > 0:
                return
            errors.append("gdal_translate não gerou ficheiro de saída.")
        except subprocess.CalledProcessError as exc:
            err = (exc.stderr or exc.stdout or b"").decode(errors="replace")
            errors.append(f"gdal_translate: {err[:400]}")

    detail = " ".join(errors) if errors else "Node.js/npx ou GDAL não encontrados."
    raise RuntimeError(
        "Não foi possível ler o ECW. Conversão automática falhou — "
        f"instale Node.js (npx ecw2tiff) ou GDAL com driver ECW. {detail}"
    )


def resolve_raster_path(path: Path) -> Path:
    """Devolve caminho legível por rasterio; converte ECW para GeoTIFF se necessário."""
    if path.suffix.lower() != ".ecw":
        return path

    tif_path = path.with_suffix(".tif")
    if tif_path.is_file():
        return tif_path

    import rasterio

    try:
        with rasterio.open(path):
            return path
    except rasterio.errors.RasterioIOError:
        convert_ecw_to_geotiff(path, tif_path)
        return tif_path
