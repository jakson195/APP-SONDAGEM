"""
Motor legacy FDM/FEM — delega ao núcleo RES2DINV (`res2dinv_solver`).

Mantém o nome da função para compatibilidade com `invert_2d.py` e testes.
"""

from __future__ import annotations

from schemas.invert_2d import Invert2DRequest, Invert2DResponse

from .res2dinv_solver import run_res2dinv_inversion


def run_legacy_fdm_invert(req: Invert2DRequest) -> Invert2DResponse:
    return run_res2dinv_inversion(req)
