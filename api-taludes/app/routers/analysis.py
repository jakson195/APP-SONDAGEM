import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.routers.surveys import _load_index
from app.services.pipeline import run_analysis

router = APIRouter(prefix="/analysis", tags=["analysis"])


class CompareBody(BaseModel):
    survey_t0_id: str
    survey_t1_id: str
    project_id: str = "default"
    dsm_t0_id: str | None = None
    dsm_t1_id: str | None = None
    threshold: float = 0.12
    min_area_px: int = 120
    max_points: int = 800
    enable_optical_flow: bool = True
    enable_dsm_diff: bool = True
    enable_segmentation: bool = True


def _survey_path(project_id: str, survey_id: str, kind: str = "ortho") -> Path | None:
    data = _load_index()
    for s in data.get("surveys", []):
        if s.get("id") == survey_id and s.get("project_id") == project_id:
            if s.get("kind") == kind or kind == "ortho":
                return settings.upload_dir / s["path"]
    for s in data.get("surveys", []):
        if s.get("id") == survey_id and s.get("project_id") == project_id:
            return settings.upload_dir / s["path"]
    return None


@router.post("/compare")
def compare_surveys(body: CompareBody):
    ortho_t0 = _survey_path(body.project_id, body.survey_t0_id, "ortho")
    ortho_t1 = _survey_path(body.project_id, body.survey_t1_id, "ortho")
    if not ortho_t0 or not ortho_t0.exists():
        raise HTTPException(404, "Ortofoto T0 não encontrada")
    if not ortho_t1 or not ortho_t1.exists():
        raise HTTPException(404, "Ortofoto T1 não encontrada")

    dsm_t0 = _survey_path(body.project_id, body.dsm_t0_id, "dsm") if body.dsm_t0_id else None
    dsm_t1 = _survey_path(body.project_id, body.dsm_t1_id, "dsm") if body.dsm_t1_id else None

    try:
        result = run_analysis(
            ortho_t0,
            ortho_t1,
            settings.output_dir,
            dsm_t0=dsm_t0,
            dsm_t1=dsm_t1,
            threshold=body.threshold,
            min_area_px=body.min_area_px,
            max_points=body.max_points,
            enable_flow=body.enable_optical_flow,
            enable_dsm=body.enable_dsm_diff and dsm_t0 is not None and dsm_t1 is not None,
            enable_seg=body.enable_segmentation,
        )
    except Exception as exc:
        raise HTTPException(500, str(exc)) from exc

    job_id = result["job_id"]
    out_base = settings.output_dir / job_id

    def _load(name: str) -> dict:
        p = out_base / name
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"type": "FeatureCollection", "features": []}

    return {
        **result,
        "points_geojson": _load("points.geojson"),
        "vectors_geojson": _load("vectors.geojson"),
        "segmentation_geojson": _load("segmentation.geojson"),
        "heatmap_url": f"/outputs/{job_id}/heatmap.png",
    }


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    meta_path = settings.output_dir / job_id / "meta.json"
    if not meta_path.exists():
        raise HTTPException(404, "Job não encontrado")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    points_path = settings.output_dir / job_id / "points.geojson"
    vectors_path = settings.output_dir / job_id / "vectors.geojson"
    seg_path = settings.output_dir / job_id / "segmentation.geojson"
    out = {**meta}
    if points_path.exists():
        out["points_geojson"] = json.loads(points_path.read_text(encoding="utf-8"))
    if vectors_path.exists():
        out["vectors_geojson"] = json.loads(vectors_path.read_text(encoding="utf-8"))
    if seg_path.exists():
        out["segmentation_geojson"] = json.loads(seg_path.read_text(encoding="utf-8"))
    out["heatmap_url"] = f"/outputs/{job_id}/heatmap.png"
    return out
