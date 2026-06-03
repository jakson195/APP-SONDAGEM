from __future__ import annotations

import numpy as np

from .mesh import idx


def roughness_matrix(nx: int, nz: int) -> np.ndarray:
    """Laplaciano isotrópico (DxᵀDx + DzᵀDz)."""
    return roughness_matrix_anisotropic(nx, nz, 1.0, 1.0)


def scale_roughness_matrix(r_mat: np.ndarray, nm: int, normalize_mesh: bool) -> np.ndarray:
    """Escala R para λ não crescer com o tamanho da malha (504 células vs 200)."""
    if not normalize_mesh or nm < 1:
        return r_mat
    return r_mat / float(nm)


def roughness_matrix_anisotropic(
    nx: int,
    nz: int,
    lambda_x: float,
    lambda_z: float,
) -> np.ndarray:
    """
    Regularização anisotrópica estilo RES2DINV:
    Φ_r = λ_x ‖D_x m‖² + λ_z ‖D_z m‖²  (m = log₁₀ ρ).
    """
    nm = nx * nz
    lx = max(float(lambda_x), 1e-12)
    lz = max(float(lambda_z), 1e-12)
    r = np.zeros((nm, nm), dtype=float)
    for i in range(nx):
        for j in range(nz):
            u = idx(i, j, nz)
            if i + 1 < nx:
                v = idx(i + 1, j, nz)
                r[u, u] += lx
                r[v, v] += lx
                r[u, v] -= lx
                r[v, u] -= lx
            if j + 1 < nz:
                v = idx(i, j + 1, nz)
                r[u, u] += lz
                r[v, v] += lz
                r[u, v] -= lz
                r[v, u] -= lz
    return r


def roughness_l2(m: np.ndarray, nx: int, nz: int) -> float:
    return roughness_l2_anisotropic(m, nx, nz, 1.0, 1.0)


def roughness_l2_anisotropic(
    m: np.ndarray,
    nx: int,
    nz: int,
    lambda_x: float,
    lambda_z: float,
) -> float:
    lx = max(float(lambda_x), 1e-12)
    lz = max(float(lambda_z), 1e-12)
    s = 0.0
    for i in range(nx):
        for j in range(nz):
            u = m[idx(i, j, nz)]
            if i + 1 < nx:
                v = m[idx(i + 1, j, nz)]
                d = u - v
                s += lx * d * d
            if j + 1 < nz:
                v = m[idx(i, j + 1, nz)]
                d = u - v
                s += lz * d * d
    return float(np.sqrt(s))


def huber_weights(res: np.ndarray, c: float) -> np.ndarray:
    w = np.ones_like(res)
    for i, r in enumerate(res):
        a = abs(float(r))
        if a > c:
            w[i] = c / max(a, 1e-12)
    return w


def l1_irls_weights(res: np.ndarray, eps: float = 1e-4) -> np.ndarray:
    """Pesos IRLS L1 com tecto (evita zerar Jacobiana)."""
    w = 1.0 / np.maximum(np.abs(res), eps)
    return np.minimum(w, 500.0)


def gradient_magnitude_per_cell(
    m: np.ndarray,
    nx: int,
    nz: int,
) -> np.ndarray:
    """|∇m| por célula (máx dos vizinhos) — para IRLS L1 na regularização."""
    nm = nx * nz
    g = np.zeros(nm, dtype=float)
    for i in range(nx):
        for j in range(nz):
            u = idx(i, j, nz)
            gm = 0.0
            if i + 1 < nx:
                v = idx(i + 1, j, nz)
                gm = max(gm, abs(float(m[u] - m[v])))
            if j + 1 < nz:
                v = idx(i, j + 1, nz)
                gm = max(gm, abs(float(m[u] - m[v])))
            g[u] = gm
    return g


def blocky_reg_irls_matrix(
    m: np.ndarray,
    nx: int,
    nz: int,
    lambda_x: float,
    lambda_z: float,
    eps: float = 0.02,
) -> np.ndarray:
    """
    Matriz R reponderada (IRLS) para inversão blocky:
    penaliza menos bordas já existentes (L1 em ∇m).
    """
    r0 = roughness_matrix_anisotropic(nx, nz, lambda_x, lambda_z)
    g = gradient_magnitude_per_cell(m, nx, nz)
    nm = nx * nz
    r = r0.copy()
    for i in range(nx):
        for j in range(nz):
            u = idx(i, j, nz)
            w_u = 1.0 / np.sqrt(g[u] * g[u] + eps * eps)
            if i + 1 < nx:
                v = idx(i + 1, j, nz)
                w_e = 1.0 / np.sqrt(
                    max(g[u], g[v]) ** 2 + eps * eps
                )
                r[u, v] *= w_e
                r[v, u] *= w_e
            if j + 1 < nz:
                v = idx(i, j + 1, nz)
                w_s = 1.0 / np.sqrt(
                    max(g[u], g[v]) ** 2 + eps * eps
                )
                r[u, v] *= w_s
                r[v, u] *= w_s
    return r


def hybrid_weights(res: np.ndarray, huber_c: float, alpha: float) -> np.ndarray:
    a = min(max(alpha, 0.0), 1.0)
    wh = huber_weights(res, huber_c)
    wl = l1_irls_weights(res, max(1e-4, huber_c * 0.25))
    return a * wh + (1.0 - a) * wl
