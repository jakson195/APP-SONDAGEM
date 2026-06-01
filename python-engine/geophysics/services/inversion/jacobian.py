from __future__ import annotations

import numpy as np

from .fdm_forward import forward_log10
from .mesh import Mesh2D


def jacobian_fd(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
    eps: float = 0.02,
) -> np.ndarray:
    """Jacobiana ∂d/∂m por diferenças finitas (d = log10 ρa)."""
    base = forward_log10(m_log10, mesh, readings)
    nm = m_log10.size
    nd = len(readings)
    j = np.zeros((nd, nm), dtype=float)
    for k in range(nm):
        pert = m_log10.copy()
        step = max(eps, 0.01 * max(abs(float(m_log10[k])), 1.0))
        pert[k] += step
        fwd = forward_log10(pert, mesh, readings)
        j[:, k] = (fwd - base) / step
    return j
