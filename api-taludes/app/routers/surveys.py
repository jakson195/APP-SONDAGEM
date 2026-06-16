import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import settings

router = APIRouter(prefix="/surveys", tags=["surveys"])

SURVEYS_INDEX = settings.upload_dir / "index.json"


def _load_index() -> dict:
    if SURVEYS_INDEX.exists():
        return json.loads(SURVEYS_INDEX.read_text(encoding="utf-8"))
    return {"surveys": []}


def _save_index(data: dict) -> None:
    SURVEYS_INDEX.write_text(json.dumps(data, indent=2), encoding="utf-8")


@router.get("")
def list_surveys(project_id: str | None = None):
    data = _load_index()
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
    if ext not in {".tif", ".tiff", ".geotiff"}:
        raise HTTPException(400, "Apenas GeoTIFF (.tif)")

    survey_id = uuid.uuid4().hex[:12]
    folder = settings.upload_dir / project_id / survey_id
    folder.mkdir(parents=True, exist_ok=True)
    dest = folder / f"{kind}{ext}"
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Máximo {settings.max_upload_mb} MB")
    dest.write_bytes(content)

    entry = {
        "id": survey_id,
        "project_id": project_id,
        "label": label or file.filename,
        "kind": kind,
        "captured_at": captured_at or datetime.now(timezone.utc).isoformat(),
        "path": str(dest.relative_to(settings.upload_dir)),
        "file_name": file.filename,
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
