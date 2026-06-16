"""Forward FDM 2D — Poisson (substitui sensibilidade gaussiana proxy)."""

from __future__ import annotations

from array_utils import writable
from legacy_bridge import ensure_legacy_path
from api_schemas import ForwardRequest, ForwardResponse, Invert2DRequest


def run_forward(body: ForwardRequest) -> ForwardResponse:
    ensure_legacy_path()
    from services.inversion.fdm_forward import forward_log10_raw
    from services.inversion.invert_common import build_display_mesh, prepare_inversion_data

    if len(body.m_log10) < 4:
        raise ValueError("m_log10 inválido para forward.")

    req = Invert2DRequest(
        readings=body.readings,
        params=body.params,
        topography=body.topography,
    )
    active, _, _, reading_dicts, _, x0, x1 = prepare_inversion_data(req)
    mesh = build_display_mesh(req, x0, x1, reading_dicts)
    nm = mesh.nx * mesh.nz
    if len(body.m_log10) != nm:
        raise ValueError(f"m_log10.length={len(body.m_log10)} ≠ nx×nz={nm}")

    m = writable(body.m_log10)
    y_syn = forward_log10_raw(m, mesh, reading_dicts)
    return ForwardResponse(
        ok=True,
        y_syn_log10=y_syn.tolist(),
        message="Forward FDM Poisson 2D",
    )
