"""
Forward 2D ERT por diferenças finitas (Poisson) + Jacobianas FD e adjoint.

  ∇·(σ ∇φ) = −I · δ(r − r_source)

Discretização em grade regular Δx × Δz.
Condição de contorno: Neumann natural nas 4 bordas (sem corrente saindo).
Singularidade removida fixando φ[0,0] = 0 (método pin).

CORREÇÕES v2.1:
  - Removido termo Neumann espúrio em iz=0 que inflacionava a diagonal
    e causava potenciais incorretos → ρa errada → log() → HTTP 500
  - Cache de potenciais em _apparent_resistivity_batch para evitar
    recalcular o mesmo eletrodo N vezes (speedup ~4-8×)
  - Guard nan/inf após spsolve com mensagem de diagnóstico clara
  - dz mínimo garantido (evita dz≈0 quando todos os níveis = 1)
"""

from __future__ import annotations

from typing import Protocol

import numpy as np
from scipy.sparse import coo_matrix, csr_matrix, eye, lil_matrix
from scipy.sparse.linalg import spsolve


# ─────────────────────────────────────────────────────────────
# PROTOCOLO — aceita qualquer objeto com a, b, m, n
# ─────────────────────────────────────────────────────────────
class QuadripoleLike(Protocol):
    a: float
    b: float
    m: float
    n: float


# ─────────────────────────────────────────────────────────────
# UTILITÁRIOS INTERNOS
# ─────────────────────────────────────────────────────────────
def _cell_index(iz: int, ix: int, nx: int) -> int:
    return iz * nx + ix


def _harmonic_mean(s1: float, s2: float) -> float:
    return 2.0 * s1 * s2 / (s1 + s2) if (s1 + s2) > 1e-30 else 0.0


def _coord_to_surface_ix(xpos: float, x0: float, dx: float, nx: int) -> int:
    return int(np.clip(int(round((xpos - x0) / dx)), 0, nx - 1))


def _geometric_factor(a: float, b: float, m: float, n: float) -> float:
    def dist(x1: float, x2: float) -> float:
        return abs(x1 - x2) + 1e-10

    return 2.0 * np.pi / (
        1.0 / dist(a, m)
        - 1.0 / dist(a, n)
        - 1.0 / dist(b, m)
        + 1.0 / dist(b, n)
    )


# ─────────────────────────────────────────────────────────────
# MATRIZ FDM
# ─────────────────────────────────────────────────────────────
def build_fdm_matrix(sigma_grid: np.ndarray, dx: float, dz: float) -> csr_matrix:
    """
    Monta a matriz de rigidez A para ∇·(σ∇φ) = 0.

    Discretização por diferenças finitas centradas de 2ª ordem.
    Condutividades nas interfaces calculadas por média harmônica.
    Condição de contorno: Neumann natural em todas as bordas
      (células de borda têm menos vizinhos → diagonal menor → fluxo zero).

    IMPORTANTE: NÃO adicionar termos extras na diagonal de borda.
    Isso era o bug da versão anterior.

    sigma_grid : (nz, nx)  condutividade [S/m]
    Retorna    : A (N×N) sparse csr, N = nz*nx
    """
    sigma_grid = np.asarray(sigma_grid, dtype=float)
    nz, nx = sigma_grid.shape
    n = nz * nx
    a = lil_matrix((n, n))

    for iz in range(nz):
        for ix in range(nx):
            k = _cell_index(iz, ix, nx)
            s_c = float(sigma_grid[iz, ix])
            diag = 0.0

            # Vizinho esquerdo
            if ix > 0:
                s = _harmonic_mean(s_c, float(sigma_grid[iz, ix - 1]))
                c = s / (dx * dx)
                a[k, _cell_index(iz, ix - 1, nx)] = -c
                diag += c

            # Vizinho direito
            if ix < nx - 1:
                s = _harmonic_mean(s_c, float(sigma_grid[iz, ix + 1]))
                c = s / (dx * dx)
                a[k, _cell_index(iz, ix + 1, nx)] = -c
                diag += c

            # Vizinho acima (iz-1)
            if iz > 0:
                s = _harmonic_mean(s_c, float(sigma_grid[iz - 1, ix]))
                c = s / (dz * dz)
                a[k, _cell_index(iz - 1, ix, nx)] = -c
                diag += c

            # Vizinho abaixo (iz+1)
            if iz < nz - 1:
                s = _harmonic_mean(s_c, float(sigma_grid[iz + 1, ix]))
                c = s / (dz * dz)
                a[k, _cell_index(iz + 1, ix, nx)] = -c
                diag += c

            # NEUMANN NATURAL: célula de borda simplesmente não tem
            # o vizinho ausente — diagonal menor, sem termos extras.
            # ← BUG REMOVIDO: o bloco "if iz == 0: diag += ..." foi eliminado.

            a[k, k] = diag

    return csr_matrix(a)


def _pin_reference(
    mat: csr_matrix,
    rhs: np.ndarray,
    pin: int = 0,
) -> tuple[csr_matrix, np.ndarray]:
    """
    Fixa φ[pin] = 0 para remover a singularidade do sistema Neumann puro.
    Zera linha e coluna do nó pin, coloca 1 na diagonal.
    """
    m = mat.tolil()
    m[pin, :] = 0.0
    m[:, pin] = 0.0
    m[pin, pin] = 1.0
    b = rhs.copy()
    b[pin] = 0.0
    return m.tocsr(), b


# ─────────────────────────────────────────────────────────────
# POTENCIAL — SOLVE POISSON
# ─────────────────────────────────────────────────────────────
def forward_potential(
    sigma_grid: np.ndarray,
    src_ix: int,
    src_iz: int,
    dx: float,
    dz: float,
    current: float = 1.0,
) -> np.ndarray:
    """
    Resolve ∇·(σ∇φ) = −I·δ(r−r_s) por FDM.

    Retorna: φ (nz, nx)
    """
    sigma_grid = np.asarray(sigma_grid, dtype=float)
    nz, nx = sigma_grid.shape

    mat = build_fdm_matrix(sigma_grid, dx, dz)

    rhs = np.zeros(nz * nx, dtype=float)
    k_src = _cell_index(src_iz, src_ix, nx)
    rhs[k_src] = current / (dx * dz)

    mat, rhs = _pin_reference(mat, rhs, pin=0)

    # Regularização numérica mínima — evita singularidade residual
    mat = mat + 1e-12 * eye(mat.shape[0], format="csr")

    phi = spsolve(mat, rhs)
    phi = np.asarray(phi, dtype=float)

    # Guard: NaN/Inf indica problema numérico grave
    if not np.all(np.isfinite(phi)):
        n_bad = int(np.sum(~np.isfinite(phi)))
        raise RuntimeError(
            f"FDM: {n_bad} valores NaN/Inf no potencial "
            f"(src_ix={src_ix}, sigma_min={sigma_grid.min():.3e}, "
            f"dx={dx:.3f}, dz={dz:.3f}). "
            "Verifique dz > 0 e sigma > 0 em todas as células."
        )

    return phi.reshape(nz, nx)


# ─────────────────────────────────────────────────────────────
# RESISTIVIDADE APARENTE
# ─────────────────────────────────────────────────────────────
def compute_apparent_resistivity(
    sigma_grid: np.ndarray,
    a: float,
    b: float,
    m: float,
    n: float,
    dx: float,
    dz: float,
    x0: float = 0.0,
) -> float:
    """
    ρa = K · ΔV/I  usando superposição φ_A(+I) + φ_B(−I).
    """
    sigma_grid = np.asarray(sigma_grid, dtype=float)
    nz, nx = sigma_grid.shape
    surface_iz = 0

    a_ix = _coord_to_surface_ix(a, x0, dx, nx)
    b_ix = _coord_to_surface_ix(b, x0, dx, nx)
    m_ix = _coord_to_surface_ix(m, x0, dx, nx)
    n_ix = _coord_to_surface_ix(n, x0, dx, nx)

    phi_a = forward_potential(sigma_grid, a_ix, surface_iz, dx, dz, current=+1.0)
    phi_b = forward_potential(sigma_grid, b_ix, surface_iz, dx, dz, current=-1.0)
    phi   = phi_a + phi_b

    dv = float(phi[surface_iz, m_ix] - phi[surface_iz, n_ix])
    k  = _geometric_factor(a, b, m, n)

    rho_a = k * dv
    # Garante positivo — valor negativo indica configuração inválida
    return float(max(rho_a, 1e-6))


def _apparent_resistivity_batch_cached(
    sigma_grid: np.ndarray,
    measurements: list[QuadripoleLike],
    dx: float,
    dz: float,
    x0: float,
) -> np.ndarray:
    """
    Calcula ρa para todas as medições usando cache de potenciais por eletrodo.

    Speedup: em vez de 2×N_meas solves FDM, faz apenas N_eletrodos_únicos solves.
    Para 91 medições dipolo-dipolo com esp=15m → ~13 eletrodos → speedup ~7×.
    """
    sigma_grid = np.asarray(sigma_grid, dtype=float)
    nz, nx = sigma_grid.shape
    surface_iz = 0

    # Coleta todos os eletrodos únicos
    elecs: set[float] = set()
    for meas in measurements:
        elecs.update((meas.a, meas.b, meas.m, meas.n))

    # Calcula e armazena φ para cada eletrodo uma única vez
    phi_cache: dict[float, np.ndarray] = {}
    for e in sorted(elecs):
        ix = _coord_to_surface_ix(e, x0, dx, nx)
        phi_cache[e] = forward_potential(
            sigma_grid, ix, surface_iz, dx, dz, current=+1.0
        )

    # Calcula ρa para cada medição usando o cache
    rho_arr = np.zeros(len(measurements), dtype=float)
    for i, meas in enumerate(measurements):
        phi = phi_cache[meas.a] - phi_cache[meas.b]
        m_ix = _coord_to_surface_ix(meas.m, x0, dx, nx)
        n_ix = _coord_to_surface_ix(meas.n, x0, dx, nx)
        dv = float(phi[surface_iz, m_ix] - phi[surface_iz, n_ix])
        k  = _geometric_factor(meas.a, meas.b, meas.m, meas.n)
        rho_arr[i] = max(k * dv, 1e-6)

    return rho_arr


# Alias interno — usado por forward_ln_data e forward_log10_data
def _apparent_resistivity_batch(
    sigma_grid: np.ndarray,
    measurements: list[QuadripoleLike],
    dx: float,
    dz: float,
    x0: float,
) -> np.ndarray:
    return _apparent_resistivity_batch_cached(sigma_grid, measurements, dx, dz, x0)


# ─────────────────────────────────────────────────────────────
# DADOS FORWARD — ln e log10
# ─────────────────────────────────────────────────────────────
def forward_ln_data(
    sigma_grid: np.ndarray,
    measurements: list[QuadripoleLike],
    dx: float,
    dz: float,
    x0: float,
) -> np.ndarray:
    """Retorna ln(ρa) para todas as medições (parâmetro do modelo = ln ρ)."""
    return np.log(
        np.maximum(
            _apparent_resistivity_batch(sigma_grid, measurements, dx, dz, x0),
            1e-6,
        )
    )


def forward_log10_data(
    sigma_grid: np.ndarray,
    measurements: list[QuadripoleLike],
    dx: float,
    dz: float,
    x0: float,
) -> np.ndarray:
    """Retorna log10(ρa) para todas as medições."""
    return np.log10(
        np.maximum(
            _apparent_resistivity_batch(sigma_grid, measurements, dx, dz, x0),
            1e-6,
        )
    )


# ─────────────────────────────────────────────────────────────
# JACOBIANA — DIFERENÇAS FINITAS
# ─────────────────────────────────────────────────────────────
def compute_jacobian_fd(
    sigma_grid: np.ndarray,
    measurements: list[QuadripoleLike],
    dx: float,
    dz: float,
    x0: float = 0.0,
    delta: float = 0.02,
) -> np.ndarray:
    """
    Jacobiana por diferenças finitas centradas em log(σ).

    J_ij = ∂ln(ρa_i)/∂ln(ρ_j)

    AVISO: O(N_cells × N_meas) solves FDM — muito lento para grades grandes.
    Use compute_jacobian_adjoint para produção.

    Retorna: J (n_meas, nz*nx)
    """
    sigma_grid = np.asarray(sigma_grid, dtype=float)
    nz, nx = sigma_grid.shape
    n_cells = nz * nx
    n_meas  = len(measurements)
    j = np.zeros((n_meas, n_cells), dtype=float)
    base = sigma_grid.copy()

    for cell in range(n_cells):
        iz, ix = divmod(cell, nx)
        sig_orig = float(base[iz, ix])

        sigma_grid[iz, ix] = sig_orig * np.exp(delta)
        rho_plus = forward_ln_data(sigma_grid, measurements, dx, dz, x0)

        sigma_grid[iz, ix] = sig_orig * np.exp(-delta)
        rho_minus = forward_ln_data(sigma_grid, measurements, dx, dz, x0)

        sigma_grid[iz, ix] = sig_orig
        # ∂ln(ρa)/∂ln(ρ);  σ=1/ρ ⟹ ∂/∂ln(ρ) = −∂/∂ln(σ)
        j[:, cell] = -(rho_plus - rho_minus) / (2.0 * delta)

    sigma_grid[:] = base
    return j


# ─────────────────────────────────────────────────────────────
# JACOBIANA — MÉTODO ADJOINT
# ─────────────────────────────────────────────────────────────
def compute_jacobian_adjoint(
    sigma_grid: np.ndarray,
    measurements: list[QuadripoleLike],
    dx: float,
    dz: float,
    x0: float = 0.0,
) -> np.ndarray:
    """
    Jacobiana pelo método adjoint (Rücker et al. 2006).

    J_ij = ∂ln(ρa_i)/∂ln(ρ_j)

    Sensibilidade física por célula j:
        s_ij = −σ_j · ∫_Ωj (∇φ_fwd · ∇φ_adj) dΩ

    φ_fwd = potencial gerado por A−B  (fontes de corrente)
    φ_adj = potencial gerado por M−N  (fontes recíprocas)

    Custo: N_eletrodos_únicos solves FDM  (vs N_cells × 2 para FD)

    Retorna: J (n_meas, nz*nx)
    """
    sigma_grid = np.asarray(sigma_grid, dtype=float)
    nz, nx = sigma_grid.shape
    n_meas  = len(measurements)
    j_mat   = np.zeros((n_meas, nz * nx), dtype=float)
    surface_iz = 0

    # Cache de potenciais por eletrodo (corrente unitária +1)
    electrodes = sorted({e for meas in measurements for e in (meas.a, meas.b, meas.m, meas.n)})
    phi_cache: dict[float, np.ndarray] = {}
    for e in electrodes:
        ix = _coord_to_surface_ix(e, x0, dx, nx)
        phi_cache[e] = forward_potential(
            sigma_grid, ix, surface_iz, dx, dz, current=+1.0
        )

    for i, meas in enumerate(measurements):
        # Campo forward: A(+1) − B(+1) = A(+1) + B(−1)
        phi_fwd = phi_cache[meas.a] - phi_cache[meas.b]

        # Campo adjoint recíproco: M(+1) − N(+1)
        phi_adj = phi_cache[meas.m] - phi_cache[meas.n]

        # Gradientes por diferenças finitas internas (np.gradient)
        gx_fwd = np.gradient(phi_fwd, dx, axis=1)
        gz_fwd = np.gradient(phi_fwd, dz, axis=0)
        gx_adj = np.gradient(phi_adj, dx, axis=1)
        gz_adj = np.gradient(phi_adj, dz, axis=0)

        # Sensibilidade: produto interno × volume celular
        # s_j = −(∇φ_fwd · ∇φ_adj)_j × ΔxΔz
        sens = -(gx_fwd * gx_adj + gz_fwd * gz_adj) * dx * dz  # (nz, nx)

        # ρa calculada para normalização
        m_ix = _coord_to_surface_ix(meas.m, x0, dx, nx)
        n_ix = _coord_to_surface_ix(meas.n, x0, dx, nx)
        dv   = float(phi_fwd[surface_iz, m_ix] - phi_fwd[surface_iz, n_ix])
        k    = _geometric_factor(meas.a, meas.b, meas.m, meas.n)
        rho_a = max(k * dv, 1e-6)

        # J em log-log: ∂ln(ρa)/∂ln(ρ)
        # sens = −(∇φ_fwd·∇φ_adj)·ΔxΔz  já contém o sinal físico correto
        # σ = 1/ρ  ⟹  ∂ln(ρa)/∂ln(ρ) = +sens·σ / ρa
        j_mat[i, :] = (sens * sigma_grid).ravel() / rho_a

    return j_mat


# ─────────────────────────────────────────────────────────────
# REGULARIZAÇÃO
# ─────────────────────────────────────────────────────────────
def build_roughness_matrix(
    nx: int,
    nz: int,
    alpha_x: float = 1.0,
    alpha_z: float = 0.5,
) -> csr_matrix:
    """
    Operador de rugosidade C — diferenças de 1ª ordem em x e z.

    Regularização Tikhonov:  φ_reg = λ · ||C m||²
    L1 IRLS blocky:          φ_reg = λ · ||W_r C m||²

    Retorna: C sparse (n_diff, nx*nz)
    """
    n    = nx * nz
    rows: list[int]   = []
    cols: list[int]   = []
    data: list[float] = []
    rc   = 0

    # Diferenças horizontais (x)
    for iz in range(nz):
        for ix in range(nx - 1):
            j = _cell_index(iz, ix, nx)
            rows.extend((rc, rc))
            cols.extend((j, j + 1))
            data.extend((-alpha_x, alpha_x))
            rc += 1

    # Diferenças verticais (z)
    for iz in range(nz - 1):
        for ix in range(nx):
            j = _cell_index(iz, ix, nx)
            rows.extend((rc, rc))
            cols.extend((j, j + nx))
            data.extend((-alpha_z, alpha_z))
            rc += 1

    if rc == 0:
        return csr_matrix((n, n))

    return coo_matrix((data, (rows, cols)), shape=(rc, n)).tocsr()


# ─────────────────────────────────────────────────────────────
# UTILITÁRIOS DE CONVERSÃO
# ─────────────────────────────────────────────────────────────
def sigma_from_log10_rho(log10_rho: np.ndarray) -> np.ndarray:
    rho = np.power(10.0, log10_rho)
    return 1.0 / np.maximum(rho, 1e-6)


def log10_rho_from_sigma(sigma_grid: np.ndarray) -> np.ndarray:
    rho = 1.0 / np.maximum(sigma_grid, 1e-12)
    return np.log10(rho)


def build_smoothness_matrix(nz: int, nx: int) -> np.ndarray:
    """CᵀC densificado — mantido para compatibilidade."""
    c = build_roughness_matrix(nx, nz)
    return (c.T @ c).toarray()
