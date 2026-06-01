from __future__ import annotations

import math
from typing import Callable

import numpy as np


def data_sigma_log10(weights: np.ndarray, huber_c: float) -> np.ndarray:
    """
    Desvio padrão em log10(ρ) a partir dos pesos de dados.
    σ ≈ 1/w (WLS); piso relativo ~ huber_c.
    """
    sigma = 1.0 / np.maximum(weights, 1e-6)
    return np.maximum(sigma, huber_c * 0.5)


def chi2_reduced(residual: np.ndarray, sigma: np.ndarray) -> float:
    """χ² = Σ (r_i / σ_i)² — reduzido (não dividido por nd)."""
    r = np.asarray(residual, dtype=float)
    s = np.maximum(np.asarray(sigma, dtype=float), 1e-8)
    return float(np.sum(np.square(r / s)))


def chi2_target(nd: int, target: float | None = None) -> float:
    """Alvo Occam: χ² ≈ nd (graus de liberdade esperados)."""
    if target is not None and target > 0:
        return float(target)
    return float(max(1, nd))


def occam_lambda_step(
    chi2: float,
    target: float,
    tolerance: float,
    lam: float,
    lam_min: float,
    lam_decay: float,
) -> tuple[float, bool]:
    """
    Reduz λ (menos regularização) enquanto χ² > alvo.
    Retorna (novo_λ, convergiu).
    """
    if chi2 <= target * (1.0 + tolerance):
        return lam, True
    return max(lam_min, lam * lam_decay), False
