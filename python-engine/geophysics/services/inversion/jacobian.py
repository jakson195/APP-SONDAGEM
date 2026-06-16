from __future__ import annotations

from typing import Callable

import numpy as np

from .fdm_forward import forward_log10 as fdm_forward_log10
from .mesh import Mesh2D, idx

ForwardFn = Callable[[np.ndarray, Mesh2D, list[dict]], np.ndarray]


def jacobian_fd(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
    eps: float = 0.02,
    forward_fn: ForwardFn | None = None,
) -> np.ndarray:
    """Jacobiana ∂d/∂m por diferenças finitas (d = log10 ρa)."""
    fwd = forward_fn or fdm_forward_log10
    base = fwd(m_log10, mesh, readings)
    nd = len(readings)
    nm = m_log10.size
    jac = np.zeros((nd, nm), dtype=float)
    for i in range(mesh.nx):
        for jz in range(mesh.nz):
            if not mesh.active[i, jz]:
                continue
            k = idx(i, jz, mesh.nz)
            pert = m_log10.copy()
            step = max(eps, 0.01 * max(abs(float(m_log10[k])), 1.0))
            pert[k] += step
            jac[:, k] = (fwd(pert, mesh, readings) - base) / step
    return jac
