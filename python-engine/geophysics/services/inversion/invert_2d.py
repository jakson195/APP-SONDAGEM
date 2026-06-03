"""
Dispatcher de inversão 2D: pyGIMLi (padrão, estilo RES2DINV) ou motor FDM legado.
"""

from __future__ import annotations

import logging
import os

from schemas.invert_2d import Invert2DRequest, Invert2DResponse

logger = logging.getLogger("geophysics.invert_2d")


def _resolve_engine(req: Invert2DRequest) -> str:
    if req.invert_engine:
        return req.invert_engine
    return os.environ.get("GEOPHYS_INVERT_ENGINE", "pygimli").strip().lower()


def run_invert_2d(req: Invert2DRequest) -> Invert2DResponse:
    engine = _resolve_engine(req)

    if engine == "legacy" or req.params.forward_model == "fem":
        from .legacy_fdm_invert import run_legacy_fdm_invert

        return run_legacy_fdm_invert(req)

    from .pygimli_invert import is_pygimli_available, run_pygimli_invert

    if is_pygimli_available():
        try:
            return run_pygimli_invert(req)
        except Exception as e:
            logger.warning("pyGIMLi falhou (%s); fallback motor legacy FDM.", e)
            from .legacy_fdm_invert import run_legacy_fdm_invert

            out = run_legacy_fdm_invert(req)
            out.message = (out.message or "") + f" [pyGIMLi fallback: {e}]"
            return out

    logger.warning("pyGIMLi não instalado; a usar motor legacy FDM.")
    from .legacy_fdm_invert import run_legacy_fdm_invert

    out = run_legacy_fdm_invert(req)
    out.message = (out.message or "") + " [instale pyGIMLi: pip install pygimli]"
    return out
