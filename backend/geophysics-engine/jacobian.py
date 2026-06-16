"""Jacobiana — adjoint FDM ou diferenças finitas."""

from __future__ import annotations

import numpy as np

from legacy_bridge import ensure_legacy_path
from api_schemas import Invert2DRequest


def compute_jacobian(
    req: Invert2DRequest,
    m_log10: np.ndarray,
) -> np.ndarray:
    ensure_legacy_path()
    from services.inversion.forward_dispatch import resolve_jacobian
    from services.inversion.invert_common import build_display_mesh, prepare_inversion_data
    from services.inversion.invert_forward import resolve_invert_forward

    active, y_obs, _, reading_dicts, _, x0, x1 = prepare_inversion_data(req)
    mesh = build_display_mesh(req, x0, x1, reading_dicts)
    forward_fn = resolve_invert_forward(
        req.params.forward_model, m_log10, mesh, reading_dicts, y_obs
    )
    return resolve_jacobian(
        req.params.forward_model,
        req.params.jacobian_mode,
        m_log10,
        mesh,
        reading_dicts,
        forward_fn=forward_fn,
    )
