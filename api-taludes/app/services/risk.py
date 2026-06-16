"""Classificação de risco de deslizamento."""

from __future__ import annotations


def classify_risk(score: float) -> str:
    if score >= 0.72:
        return "alto"
    if score >= 0.42:
        return "medio"
    return "baixo"


def risk_score(
    intensity: float,
    flow_mag_norm: float,
    dsm_delta_norm: float,
    area_px: float,
) -> float:
    area_factor = min(1.0, area_px / 2000.0)
    return min(
        1.0,
        0.35 * intensity
        + 0.3 * flow_mag_norm
        + 0.2 * dsm_delta_norm
        + 0.15 * area_factor,
    )


def summarize_risk(features: list[dict]) -> dict[str, int]:
    out = {"baixo": 0, "medio": 0, "alto": 0}
    for f in features:
        r = f.get("properties", {}).get("risk", "baixo")
        if r in out:
            out[r] += 1
    return out
