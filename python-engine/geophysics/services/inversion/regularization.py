from __future__ import annotations

import numpy as np

from .mesh import idx


def roughness_matrix(nx: int, nz: int) -> np.ndarray:
    nm = nx * nz
    r = np.zeros((nm, nm), dtype=float)
    for i in range(nx):
        for j in range(nz):
            u = idx(i, j, nz)
            if i + 1 < nx:
                v = idx(i + 1, j, nz)
                r[u, u] += 1
                r[v, v] += 1
                r[u, v] -= 1
                r[v, u] -= 1
            if j + 1 < nz:
                v = idx(i, j + 1, nz)
                r[u, u] += 1
                r[v, v] += 1
                r[u, v] -= 1
                r[v, u] -= 1
    return r


def roughness_l2(m: np.ndarray, nx: int, nz: int) -> float:
    s = 0.0
    for i in range(nx):
        for j in range(nz):
            u = m[idx(i, j, nz)]
            if i + 1 < nx:
                v = m[idx(i + 1, j, nz)]
                s += (u - v) ** 2
            if j + 1 < nz:
                v = m[idx(i, j + 1, nz)]
                s += (u - v) ** 2
    return float(np.sqrt(s))


def huber_weights(res: np.ndarray, c: float) -> np.ndarray:
    w = np.ones_like(res)
    for i, r in enumerate(res):
        a = abs(float(r))
        if a > c:
            w[i] = c / max(a, 1e-12)
    return w


def l1_irls_weights(res: np.ndarray, eps: float = 1e-4) -> np.ndarray:
    return 1.0 / np.maximum(np.abs(res), eps)


def hybrid_weights(res: np.ndarray, huber_c: float, alpha: float) -> np.ndarray:
    a = min(max(alpha, 0.0), 1.0)
    wh = huber_weights(res, huber_c)
    wl = l1_irls_weights(res, max(1e-4, huber_c * 0.25))
    return a * wh + (1.0 - a) * wl
