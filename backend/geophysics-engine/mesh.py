"""Malha 2D — pyGIMLi createParaMesh quando disponível; fallback interno."""

from __future__ import annotations

import numpy as np

from legacy_bridge import ensure_legacy_path
from api_schemas import Invert2DRequest, MeshRequest, MeshResponse, ReadingIn


def _active_readings(readings: list[ReadingIn]) -> list[ReadingIn]:
    return [r for r in readings if not r.excluded and r.rho_ohm_m > 0]


def _to_invert_request(body: MeshRequest) -> Invert2DRequest:
    return Invert2DRequest(
        readings=body.readings,
        params=body.params,
        topography=body.topography,
        method="blocky_l1",
    )


def is_pygimli_mesh_available() -> bool:
    try:
        ensure_legacy_path()
        from services.inversion.pygimli_invert import is_pygimli_available

        return is_pygimli_available()
    except Exception:
        return False


def build_para_mesh_info(req: Invert2DRequest) -> dict:
    """Info da malha pyGIMLi (refino junto aos eletrodos)."""
    ensure_legacy_path()
    from services.inversion.fdm_forward import electrode_layout
    from services.inversion.invert_common import prepare_inversion_data

    active, _, _, reading_dicts, _, x0, x1 = prepare_inversion_data(req)
    positions: dict[float, int] = {}

    def sid(x: float) -> int:
        k = round(float(x), 4)
        if k not in positions:
            positions[k] = len(positions)
        return positions[k]

    for r, d in zip(active, reading_dicts):
        ly = electrode_layout(d["station_m"], d["n"], d["a_m"])
        for x in (ly.a_x, ly.b_x, ly.m_x, ly.n_x):
            sid(x)

    pos = np.zeros((len(positions), 2))
    for x, i in positions.items():
        pos[i, 0] = x

    try:
        import pygimli as pg
        from pygimli.meshtools import createParaMesh

        data = pg.DataContainerERT()
        data.setSensorPositions(pos)
        para = createParaMesh(data, quality=34, paraMaxCellSize=3, paraDepth=1.0)
        return {
            "engine": "pygimli_para",
            "n_cells": int(para.cellCount()),
            "x_span": [float(x0), float(x1)],
        }
    except Exception as e:
        return {"engine": "internal_grid", "error": str(e), "x_span": [float(x0), float(x1)]}


def build_mesh_response(body: MeshRequest) -> MeshResponse:
    ensure_legacy_path()
    from services.inversion.invert_common import build_display_mesh, prepare_inversion_data
    from services.inversion.sensitivity_depth import column_sensitivity_depth_m

    req = _to_invert_request(body)
    active, _, _, reading_dicts, _, x0, x1 = prepare_inversion_data(req)
    mesh = build_display_mesh(req, x0, x1, reading_dicts)
    z_cover = column_sensitivity_depth_m(mesh, reading_dicts, req.params.factor_depth)
    para = build_para_mesh_info(req)
    engine = para.get("engine", "internal_grid")

    return MeshResponse(
        ok=True,
        nx=mesh.nx,
        nz=mesh.nz,
        x_edges_m=mesh.x_edges.tolist(),
        z_edges_m=mesh.z_edges.tolist(),
        active_cells=[
            bool(mesh.active[i, j])
            for i in range(mesh.nx)
            for j in range(mesh.nz)
        ],
        z_cover_m=z_cover.tolist(),
        engine=str(engine),
        message=f"Malha {mesh.nx}×{mesh.nz} — {engine}",
    )
