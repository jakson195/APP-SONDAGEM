"""Mapeamento UI / RES2DINV ↔ motores de inversão (pyGIMLi, SimPEG, ResIPy, legacy FDM)."""

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

# Método da UI → parâmetros SimPEG
SIMPEG_METHOD: dict[MethodId, dict[str, float | bool]] = {
    "least_squares": {"lam_scale": 0.4},
    "occam": {"lam_scale": 1.4},
    "gauss_newton": {"lam_scale": 1.0},
    "smoothness": {"lam_scale": 1.1},
    "robust_l1": {"lam_scale": 0.9},
    "blocky_l1": {"lam_scale": 0.65},
    "hybrid": {"lam_scale": 0.95},
}

SIMPEG_METHOD_LABEL: dict[MethodId, str] = {
    "least_squares": "Mínimos quadrados (SimPEG L2)",
    "occam": "Occam (SimPEG)",
    "gauss_newton": "Gauss-Newton (SimPEG)",
    "smoothness": "Suavizada L2 (SimPEG)",
    "robust_l1": "Robusta L1 (SimPEG)",
    "blocky_l1": "Blocky / contraste (SimPEG)",
    "hybrid": "Híbrida (SimPEG)",
}

# Método da UI → parâmetros ResIPy / R2 (inverse_type: 0=L2, 1=Occam, 2=GN, 3=robust, 4=blocky)
RESIPY_METHOD: dict[MethodId, dict[str, float | int]] = {
    "least_squares": {"inverse_type": 0, "alpha_s_scale": 80.0, "aniso_scale": 1.0, "a_wgt": 0.02, "b_wgt": 0.0},
    "occam": {"inverse_type": 1, "alpha_s_scale": 220.0, "aniso_scale": 1.2, "a_wgt": 0.03, "b_wgt": 0.0},
    "gauss_newton": {"inverse_type": 2, "alpha_s_scale": 120.0, "aniso_scale": 1.0, "a_wgt": 0.03, "b_wgt": 0.0},
    "smoothness": {"inverse_type": 0, "alpha_s_scale": 150.0, "aniso_scale": 1.3, "a_wgt": 0.03, "b_wgt": 0.0},
    "robust_l1": {"inverse_type": 3, "alpha_s_scale": 90.0, "aniso_scale": 1.0, "a_wgt": 0.03, "b_wgt": 0.0},
    "blocky_l1": {"inverse_type": 4, "alpha_s_scale": 70.0, "aniso_scale": 0.85, "a_wgt": 0.03, "b_wgt": 0.0},
    "hybrid": {"inverse_type": 3, "alpha_s_scale": 100.0, "aniso_scale": 1.0, "a_wgt": 0.03, "b_wgt": 0.0},
}

RESIPY_METHOD_LABEL: dict[MethodId, str] = {
    "least_squares": "Mínimos quadrados (ResIPy R2 L2)",
    "occam": "Occam (ResIPy R2)",
    "gauss_newton": "Gauss-Newton (ResIPy R2)",
    "smoothness": "Suavizada L2 (ResIPy R2)",
    "robust_l1": "Robusta L1 dados (ResIPy R2)",
    "blocky_l1": "Blocky (ResIPy R2)",
    "hybrid": "Híbrida robusta (ResIPy R2)",
}

# Métodos que continuam no motor FDM legado (FEM ou fallback sem pyGIMLi)
LEGACY_ONLY_METHODS: frozenset[MethodId] = frozenset()
