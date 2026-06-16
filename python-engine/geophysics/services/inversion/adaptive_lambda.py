"""
λ adaptativo estilo RES2DINV / Occam: reduz regularização enquanto χ² ou RMS
permanecem acima do alvo; para quando o ajuste aos dados é suficiente.
"""

from __future__ import annotations


def adaptive_lambda_step(
    chi2: float,
    target_chi2: float,
    chi2_tolerance: float,
    rms_log10: float,
    target_rms_log10: float,
    lam: float,
    lam_min: float,
    lam_decay: float,
    relative_gain: float | None = None,
    min_improvement: float = 1e-4,
    rms_percent: float | None = None,
    target_rms_percent: float = 12.0,
    min_iter: int = 0,
    current_iter: int = 0,
) -> tuple[float, bool]:
    """
    Retorna (novo_λ, convergiu).

    - χ² ≤ alvo e RMS log₁₀ ≤ alvo → convergiu (mantém λ).
    - χ² > alvo → reduz λ (menos suavização, mais ajuste aos dados).
    - Ganho relativo de φ abaixo do limiar → convergiu.
    """
    chi2_ok = chi2 <= target_chi2 * (1.0 + chi2_tolerance)
    rms_ok = rms_log10 <= target_rms_log10
    pct_ok = rms_percent is None or rms_percent <= target_rms_percent
    if (
        current_iter + 1 >= min_iter
        and chi2_ok
        and rms_ok
        and pct_ok
    ):
        return lam, True

    if (
        current_iter + 1 >= min_iter
        and relative_gain is not None
        and relative_gain < min_improvement
        and pct_ok
    ):
        return lam, True

    if chi2 > target_chi2 * (1.0 + chi2_tolerance):
        return max(lam_min, lam * lam_decay), False

    if rms_log10 > target_rms_log10 * 1.05:
        return max(lam_min, lam * lam_decay), False

    return lam, False
