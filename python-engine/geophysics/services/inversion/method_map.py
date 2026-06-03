"""Mapeamento UI / RES2DINV ↔ motores de inversão (pyGIMLi e legacy FDM)."""

from __future__ import annotations

from schemas.invert_2d import MethodId

# Método da UI → parâmetros pyGIMLi (λ relativo, modelo blocky, iterações IRLS internas)
PYGIMLI_METHOD: dict[MethodId, dict[str, float | bool | int]] = {
    "least_squares": {"lam_scale": 0.35, "blocky": False, "robust_data": False},
    "occam": {"lam_scale": 1.5, "blocky": False, "robust_data": False},
    "gauss_newton": {"lam_scale": 1.0, "blocky": False, "robust_data": False},
    "smoothness": {"lam_scale": 1.2, "blocky": False, "robust_data": False},
    "robust_l1": {"lam_scale": 0.85, "blocky": False, "robust_data": True},
    "blocky_l1": {"lam_scale": 0.55, "blocky": True, "robust_data": True},
    "hybrid": {"lam_scale": 0.9, "blocky": False, "robust_data": True},
}

PYGIMLI_METHOD_LABEL: dict[MethodId, str] = {
    "least_squares": "Mínimos quadrados (pyGIMLi L2)",
    "occam": "Occam / λ adaptativo (pyGIMLi)",
    "gauss_newton": "Gauss-Newton L2 (pyGIMLi, estilo RES2DINV)",
    "smoothness": "Suavizada L2 (pyGIMLi)",
    "robust_l1": "Robusta L1 dados (pyGIMLi)",
    "blocky_l1": "Blocky L1 ∇m (pyGIMLi)",
    "hybrid": "Híbrida robusta (pyGIMLi)",
}

# Métodos que continuam no motor FDM legado (FEM ou fallback sem pyGIMLi)
LEGACY_ONLY_METHODS: frozenset[MethodId] = frozenset()
