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


def _adjoint_needs_fd_fallback(
    j_adj: np.ndarray,
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
    forward_fn: ForwardFn,
) -> bool:
    """Adjoint degenerada (≈0) enquanto o forward responde ao modelo."""
    if j_adj.size == 0:
        return True
    adj_norm = float(np.linalg.norm(j_adj))
    if adj_norm < 1e-10:
        return True
    from .jacobian import jacobian_fd

    probe = jacobian_fd(
        m_log10,
        mesh,
        readings[: min(3, len(readings))],
        eps=0.02,
        forward_fn=forward_fn,
    )
    fd_norm = float(np.linalg.norm(probe))
    if fd_norm < 1e-10:
        return False
    return adj_norm < 0.01 * fd_norm


def resolve_jacobian(
    forward_model: str,
    jacobian_mode: str,
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
    forward_fn: ForwardFn | None = None,
) -> np.ndarray:
    """FEM usa Jacobiana FD; FDM adjoint com fallback FD se escala inválida."""
    fwd = forward_fn or resolve_forward(forward_model)
    use_fd = (
        forward_model == "fem"
        or jacobian_mode == "fd"
        or getattr(fwd, "_is_invert", False)
    )
    if use_fd:
        from .jacobian import jacobian_fd

        return jacobian_fd(m_log10, mesh, readings, eps=0.025, forward_fn=fwd)
    from .jacobian_adjoint import jacobian_adjoint

    j_adj = jacobian_adjoint(m_log10, mesh, readings)
    if _adjoint_needs_fd_fallback(j_adj, m_log10, mesh, readings, fwd):
        from .jacobian import jacobian_fd

        return jacobian_fd(m_log10, mesh, readings, eps=0.025, forward_fn=fwd)
    return j_adj
