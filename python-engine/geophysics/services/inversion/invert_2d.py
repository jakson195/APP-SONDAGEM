"""
Dispatcher de inversão 2D — ResIPy R2 ou FDM RES2DINV (fallback).
"""

from __future__ import annotations

import logging
import os

from schemas.invert_2d import Invert2DRequest, Invert2DResponse

logger = logging.getLogger("geophysics.invert_2d")

_ALLOWED = frozenset({"resipy", "legacy"})


def _resipy_available() -> bool:
    from .resipy_invert import is_resipy_available

    return is_resipy_available()


def _resolve_engine(req: Invert2DRequest) -> str:
    if req.invert_engine:
        eng = req.invert_engine.strip().lower()
        if eng not in _ALLOWED:
            raise ValueError(
                f"Motor «{eng}» inválido. Use invert_engine=resipy ou legacy."
            )
        return eng

    env = os.environ.get("GEOPHYS_INVERT_ENGINE", "auto").strip().lower()
    if env in _ALLOWED:
        return env
    if env == "auto":
        return "resipy" if _resipy_available() else "legacy"
    return "resipy" if _resipy_available() else "legacy"


def run_invert_2d(req: Invert2DRequest) -> Invert2DResponse:
    engine = _resolve_engine(req)

    if engine == "legacy":
        from .legacy_fdm_invert import run_legacy_fdm_invert

        logger.info("inversão via motor FDM RES2DINV (legacy)")
        return run_legacy_fdm_invert(req)

    from .resipy_invert import resipy_unavailable_reason, run_resipy_invert

    if not _resipy_available():
        reason = resipy_unavailable_reason() or "ResIPy não instalado."
        logger.warning("%s — fallback para FDM RES2DINV", reason)
        from .legacy_fdm_invert import run_legacy_fdm_invert

        return run_legacy_fdm_invert(req)

    return run_resipy_invert(req)
