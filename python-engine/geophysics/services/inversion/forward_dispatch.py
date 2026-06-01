from __future__ import annotations

from typing import Callable

import numpy as np

from .mesh import Mesh2D


ForwardFn = Callable[[np.ndarray, Mesh2D, list[dict]], np.ndarray]


def resolve_forward(forward_model: str) -> ForwardFn:
    if forward_model == "fem":
        from .fem_forward import forward_log10

        return forward_log10
    from .fdm_forward import forward_log10

    return forward_log10


def resolve_jacobian(
    forward_model: str,
    jacobian_mode: str,
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
) -> np.ndarray:
    """FEM usa Jacobiana FD; FDM pode usar adjoint ou FD."""
    use_fd = forward_model == "fem" or jacobian_mode == "fd"
    if use_fd:
        from .jacobian import jacobian_fd

        return jacobian_fd(m_log10, mesh, readings, eps=0.015)
    from .jacobian_adjoint import jacobian_adjoint

    return jacobian_adjoint(m_log10, mesh, readings)
