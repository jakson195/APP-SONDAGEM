"""
Forward calibrado para inversão: ρa = scale × ρ_raw (K·ΔV/I).

O factor ρ_mean/ρ_ref dinâmico destrói sensibilidade espacial (Jacobian quase
uniforme). Na inversão usamos escala fixa estimada no modelo inicial.
"""
from __future__ import annotations

from typing import Callable

import numpy as np

from .fdm_forward import (
    electrode_layout,
    forward_reading_log10_raw,
    forward_log10_raw,
)
from .mesh import Mesh2D

ForwardFn = Callable[[np.ndarray, Mesh2D, list[dict]], np.ndarray]


def build_invert_forward(
    base_forward: ForwardFn,
    m_init: np.ndarray,
    mesh: Mesh2D,
    reading_dicts: list[dict],
    y_obs: np.ndarray,
) -> ForwardFn:
    """
    ρa_invert = median(ρ_obs/ρ_raw(m_init)) × ρ_raw(m).
    Preserva gradientes espaciais de ρ_raw.
    """
    syn0 = base_forward(m_init, mesh, reading_dicts)
    obs_rho = 10.0 ** y_obs
    syn_rho = 10.0 ** syn0
    ratios = obs_rho / np.maximum(syn_rho, 1e-6)
    ratios = ratios[np.isfinite(ratios) & (ratios > 1e-6)]
    scale = float(np.median(ratios)) if ratios.size else 1.0
    scale = float(np.clip(scale, 0.08, 25.0))
    log10_scale = float(np.log10(scale))

    def forward_invert(
        m_log10: np.ndarray,
        mesh_in: Mesh2D,
        readings: list[dict],
    ) -> np.ndarray:
        if base_forward.__name__ == "forward_log10_raw" or hasattr(
            base_forward, "_is_raw"
        ):
            raw = forward_log10_raw(m_log10, mesh_in, readings)
        else:
            raw = forward_log10_raw(m_log10, mesh_in, readings)
        return raw + log10_scale

    forward_invert._is_invert = True  # type: ignore[attr-defined]
    forward_invert._scale_ohm = scale  # type: ignore[attr-defined]
    return forward_invert


def resolve_invert_forward(
    forward_model: str,
    m_init: np.ndarray,
    mesh: Mesh2D,
    reading_dicts: list[dict],
    y_obs: np.ndarray,
    *,
    use_amplitude_scale: bool = False,
) -> ForwardFn:
    from .forward_dispatch import resolve_forward

    if forward_model == "fem":
        base = resolve_forward(forward_model)
    else:
        base = forward_log10_raw
    if use_amplitude_scale:
        return build_invert_forward(base, m_init, mesh, reading_dicts, y_obs)
    return base
