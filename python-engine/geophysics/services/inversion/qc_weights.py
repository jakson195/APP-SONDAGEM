from __future__ import annotations

import numpy as np

from schemas.invert_2d import ReadingIn


def compute_data_weights(
    readings: list[ReadingIn],
    *,
    auto_exclude_outliers: bool,
    outlier_score_threshold: float,
) -> tuple[np.ndarray, list[int]]:
    weights = np.zeros(len(readings), dtype=float)
    excluded: list[int] = []
    for i, r in enumerate(readings):
        if r.excluded:
            excluded.append(i)
            continue
        w = 1.0 / np.sqrt(max(r.n, 1))
        if r.qc_score is not None:
            w *= max(0.05, float(r.qc_score) / 100.0)
        if r.is_spike:
            w *= 0.15
        if r.i_ma is not None and r.i_ma > 0:
            if r.i_ma >= 5:
                w *= 1.0
            elif r.i_ma >= 2:
                w *= 0.65
            else:
                w *= 0.25
        score = r.qc_score if r.qc_score is not None else 100.0
        if auto_exclude_outliers and (r.is_spike or score < outlier_score_threshold):
            excluded.append(i)
            continue
        weights[i] = max(w, 1e-4)
    return weights, excluded
