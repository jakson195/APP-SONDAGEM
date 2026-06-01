import numpy as np
from fastapi import APIRouter, HTTPException

from schemas.volume import VolumeBuildRequest, VolumeBuildResponse
from services.interpolation import build_volume, volume_to_list

router = APIRouter(prefix="/volume", tags=["volume"])


@router.post("/build", response_model=VolumeBuildResponse)
async def build_volume_endpoint(req: VolumeBuildRequest) -> VolumeBuildResponse:
    if len(req.sample_points) < 4:
        raise HTTPException(
            status_code=400,
            detail="Mínimo 4 pontos amostra para interpolação 3D.",
        )

    try:
        vol = build_volume(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    flat = volume_to_list(vol)
    valid = sum(1 for v in flat if np.isfinite(v))

    return VolumeBuildResponse(
        log_rho=flat,
        nx=req.nx,
        ny=req.ny,
        nz=req.nz,
        method=req.method,
        sample_count=len(req.sample_points),
        valid_voxels=valid,
    )
