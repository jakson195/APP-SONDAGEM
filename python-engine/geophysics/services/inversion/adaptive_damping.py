"""
Amortecimento adaptativo estilo Levenberg-Marquardt para Gauss-Newton estável.

Sistema: (JᵀJ + λ R + μ I) Δm = Jᵀ r
μ diminui quando o passo reduz o misfit; aumenta quando rejeitado.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AdaptiveDamping:
    mu: float = 1e-3
    nu: float = 2.0
    mu_min: float = 1e-8
    mu_max: float = 1e4

    def diagonal(self, nm: int, scale: float = 1.0) -> float:
        return float(self.mu * scale)

    def accept_step(self, phi_new: float, phi_old: float) -> None:
        if phi_new < phi_old:
            self.mu = max(self.mu_min, self.mu / self.nu)
        else:
            self.mu = min(self.mu_max, self.mu * self.nu)

    def reject_step(self) -> None:
        self.mu = min(self.mu_max, self.mu * self.nu)
