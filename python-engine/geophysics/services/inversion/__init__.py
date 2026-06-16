"""Motor matemático de inversão 2D estilo RES2DINV (FDM/FEM + GN + smoothness + robust)."""

from .res2dinv_solver import run_res2dinv_inversion

__all__ = ["run_res2dinv_inversion"]
