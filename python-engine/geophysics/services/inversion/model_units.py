"""
Parâmetro de modelo m = ln(ρ) [ρ em Ω·m].
Dados e pseudoseção permanecem em log₁₀(ρa) (compatível RES2DINV / SOLODATA).
"""

from __future__ import annotations

import numpy as np

from services.array_utils import writable

from .mesh import Mesh2D, idx

LN10 = float(np.log(10.0))

# ln(1 Ω·m) … ln(5×10⁵ Ω·m) — evita clipping que homogeneíza o modelo
M_LN_MIN = float(np.log(1.0))
M_LN_MAX = float(np.log(5.0e5))


def rho_ohm_to_m_ln(rho_ohm: float) -> float:
    return float(np.log(max(float(rho_ohm), 1e-12)))


def m_ln_to_rho_ohm(m_ln: float) -> float:
    return float(np.exp(float(m_ln)))


def m_ln_array_to_log10_rho(m_ln: np.ndarray) -> np.ndarray:
    return writable(m_ln) / LN10


def log10_rho_to_m_ln(log10_rho: float) -> float:
    return float(log10_rho) * LN10


def y_log10_to_m_ln(y_log10: np.ndarray) -> np.ndarray:
    return writable(y_log10) * LN10


def clip_m_ln(m: np.ndarray) -> np.ndarray:
    return np.clip(m, M_LN_MIN, M_LN_MAX)


def conductivity_from_m_ln(m_ln: np.ndarray, mesh: Mesh2D) -> np.ndarray:
    """σ = 1/ρ = exp(−m) S/m com m = ln(ρ)."""
    sigma = np.zeros((mesh.nx, mesh.nz), dtype=float)
    for i in range(mesh.nx):
        for j in range(mesh.nz):
            if mesh.active[i, j]:
                sigma[i, j] = float(np.exp(-float(m_ln[idx(i, j, mesh.nz)])))
            else:
                sigma[i, j] = 1e-8
    return sigma


def mean_resistivity_ohm(m_ln: np.ndarray, mesh: Mesh2D) -> float:
    vals = [
        m_ln_to_rho_ohm(float(m_ln[idx(i, j, mesh.nz)]))
        for i in range(mesh.nx)
        for j in range(mesh.nz)
        if mesh.active[i, j]
    ]
    return float(np.mean(vals)) if vals else 1.0
