"""Regularização anisotrópica L2 / blocky (estilo RES2DINV)."""

from __future__ import annotations

import numpy as np

from legacy_bridge import ensure_legacy_path
from api_schemas import InvertParamsIn


def build_regularization_matrix(
    nx: int,
    nz: int,
    params: InvertParamsIn,
) -> np.ndarray:
    ensure_legacy_path()
    from services.inversion.regularization import (
        roughness_matrix_anisotropic,
        scale_roughness_matrix,
    )

    nm = nx * nz
    r = roughness_matrix_anisotropic(nx, nz, params.lambda_x, params.lambda_z)
    return scale_roughness_matrix(r, nm, params.reg_normalize_mesh)
