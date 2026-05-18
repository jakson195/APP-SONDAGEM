import uuid
from pathlib import Path

import aiofiles
from fastapi import HTTPException, UploadFile

from app.config import settings


def ensure_upload_dirs() -> None:
    base = settings.upload_path
    for sub in ("lidar", "las", "insar", "temp", "work", "tilesets"):
        (base / sub).mkdir(parents=True, exist_ok=True)
    (base / "insar" / "jobs").mkdir(parents=True, exist_ok=True)
    (base / "insar" / "processed").mkdir(parents=True, exist_ok=True)


def _safe_filename(name: str) -> str:
    return Path(name).name.replace("..", "").strip() or "file"


async def save_upload(
    file: UploadFile,
    category: str,
    project_id: uuid.UUID,
    *,
    max_mb: int | None = None,
) -> tuple[Path, str]:
    ensure_upload_dirs()
    limit = (max_mb or settings.max_upload_mb) * 1024 * 1024
    ext = Path(_safe_filename(file.filename or "upload")).suffix
    dest_name = f"{project_id}_{uuid.uuid4().hex}{ext}"
    rel = Path(category) / dest_name
    dest = settings.upload_path / rel
    dest.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    async with aiofiles.open(dest, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"Ficheiro excede {max_mb or settings.max_upload_mb} MB",
                )
            await out.write(chunk)

    return dest, str(rel).replace("\\", "/")


def is_las_file(filename: str) -> bool:
    lower = filename.lower()
    return lower.endswith((".las", ".laz"))


def guess_lidar_type(filename: str) -> str:
    lower = filename.lower()
    if is_las_file(filename):
        return "point_cloud"
    if lower.endswith((".tif", ".tiff", ".dem")):
        return "dtm"
    return "lidar"
