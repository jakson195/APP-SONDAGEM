"""Clamp log₁₀(ρ) ao intervalo [rho_min, rho_max] (estilo ResIPy)."""

from __future__ import annotations

import numpy as np

from services.array_utils import writable


def clamp_m_log10(
    m_log10: np.ndarray,
    rho_min_ohm_m: float,
    rho_max_ohm_m: float,
) -> np.ndarray:
    lo = max(float(rho_min_ohm_m), 1e-6)
    hi = max(float(rho_max_ohm_m), lo * 1.01)
    m_min = float(np.log10(lo))
    m_max = float(np.log10(hi))
    out = writable(m_log10)
    finite = np.isfinite(out)
    out[finite] = np.clip(out[finite], m_min, m_max)
    return out
