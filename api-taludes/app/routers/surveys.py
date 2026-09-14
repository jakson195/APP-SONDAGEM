import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import SUPPORTED_RASTER_EXTENSIONS, settings
from app.services.ecw_convert import convert_ecw_to_geotiff, resolve_raster_path

router = APIRouter(prefix="/surveys", tags=["surveys"])

SURVEYS_INDEX = settings.upload_dir / "index.json"


def _sync_index_raster_paths(data: dict) -> dict:
    """Atualiza entradas .ecw → .tif quando a conversão já existe."""
    changed = False
    for survey in data.get("surveys", []):
        rel = survey.get("path", "")
        if not rel.lower().endswith(".ecw"):
            continue
        tif_rel = rel[:-4] + ".tif"
        tif_abs = settings.upload_dir / tif_rel
        if tif_abs.is_file() and survey.get("path") != tif_rel:
            survey["path"] = tif_rel
            changed = True
    if changed:
        _save_index(data)
    return data


def _prepare_survey_file(path: Path) -> Path:
    """Garante raster legível (converte ECW se necessário)."""
    return resolve_raster_path(path)


def _survey_path(project_id: str, survey_id: str | None, kind: str = "ortho") -> Path | None:
    if not survey_id:
        return None
    data = _load_index()
    for s in data.get("surveys", []):
        if s.get("id") == survey_id and s.get("project_id") == project_id:
            if s.get("kind") == kind or kind == "ortho":
                return settings.upload_dir / s["path"]
    for s in data.get("surveys", []):
        if s.get("id") == survey_id and s.get("project_id") == project_id:
            return settings.upload_dir / s["path"]
    return None


def _load_index() -> dict:
    if SURVEYS_INDEX.exists():
        return json.loads(SURVEYS_INDEX.read_text(encoding="utf-8"))
    return {"surveys": []}


def _save_index(data: dict) -> None:
    SURVEYS_INDEX.write_text(json.dumps(data, indent=2), encoding="utf-8")


@router.get("")
def list_surveys(project_id: str | None = None):
    data = _sync_index_raster_paths(_load_index())
    surveys = data.get("surveys", [])
    if project_id:
        surveys = [s for s in surveys if s.get("project_id") == project_id]
    return {"surveys": surveys}


@router.post("/upload")
async def upload_survey(
    file: UploadFile = File(...),
    label: str = Form(""),
    project_id: str = Form("default"),
    captured_at: str = Form(""),
    kind: str = Form("ortho"),
):
    if not file.filename:
        raise HTTPException(400, "Ficheiro obrigatório")
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_RASTER_EXTENSIONS:
        raise HTTPException(
            400,
            "Formato não suportado. Use GeoTIFF (.tif, .tiff) ou ECW (.ecw).",
        )

    survey_id = uuid.uuid4().hex[:12]
    folder = settings.upload_dir / project_id / survey_id
    folder.mkdir(parents=True, exist_ok=True)
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Máximo {settings.max_upload_mb} MB")

    original_name = file.filename
    if ext == ".ecw":
        ecw_path = folder / f"{kind}.ecw"
        ecw_path.write_bytes(content)
        tif_path = folder / f"{kind}.tif"
        try:
            convert_ecw_to_geotiff(ecw_path, tif_path)
        except RuntimeError as exc:
            shutil.rmtree(folder, ignore_errors=True)
            raise HTTPException(501, str(exc)) from exc
        dest = tif_path
    else:
        dest = folder / f"{kind}{ext}"
        dest.write_bytes(content)

    entry = {
        "id": survey_id,
        "project_id": project_id,
        "label": label or original_name,
        "kind": kind,
        "captured_at": captured_at or datetime.now(timezone.utc).isoformat(),
        "path": str(dest.relative_to(settings.upload_dir)),
        "file_name": original_name,
        "source_format": "ecw" if ext == ".ecw" else ext.lstrip("."),
    }
    data = _load_index()
    data.setdefault("surveys", []).append(entry)
    _save_index(data)
    return entry


@router.delete("/{survey_id}")
def delete_survey(survey_id: str, project_id: str = "default"):
    data = _load_index()
    before = len(data.get("surveys", []))
    data["surveys"] = [
        s for s in data.get("surveys", []) if s.get("id") != survey_id
    ]
    if len(data["surveys"]) == before:
        raise HTTPException(404, "Survey não encontrado")
    folder = settings.upload_dir / project_id / survey_id
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)
    _save_index(data)
    return {"ok": True}
