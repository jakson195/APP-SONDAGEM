from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from services.array_utils import writable
from scipy import sparse
from scipy.sparse.linalg import spsolve

from .mesh import Mesh2D, idx
from .model_units import (
    LN10,
    clip_m_ln,
    conductivity_from_m_ln,
    log10_rho_to_m_ln,
    mean_resistivity_ohm,
    m_ln_array_to_log10_rho,
    rho_ohm_to_m_ln,
)


@dataclass
class ElectrodeLayout:
    a_x: float
    b_x: float
    m_x: float
    n_x: float
    k_geom: float


def _solodata_g_factor(nivel: int) -> float:
    """G SOLODATA / RES2DINV: 1 / (1/n − 2/(n+1) + 1/(n+2))."""
    h = max(1, int(round(nivel)))
    denom = 1.0 / h - 2.0 / (h + 1) + 1.0 / (h + 2)
    if abs(denom) < 1e-15:
        denom = 1e-15
    return 1.0 / denom


def _solodata_k_factor(nivel: int, a_m: float) -> float:
    """K = 2π·G·a = π·a·n·(n+1)·(n+2) — igual a geometricFactorDipoloDipolo (TS)."""
    return 2.0 * math.pi * _solodata_g_factor(nivel) * max(a_m, 0.5)


def geometric_factor_dipolo_dipolo(a_m: float, n: int) -> float:
    """K colinear dipolo-dipolo (Ω·m por V/A), alinhado ao módulo TS."""
    nn = max(1, int(round(n)))
    a = max(a_m, 0.5)
    return math.pi * a * nn * (nn + 1) * (nn + 2)


# Correcção 2D FDM vs resposta 3D/SOLODATA (definida por run_invert_2d).
_K_2D_FDM_CALIB: float = 1.0


def set_fdm_k_2d_calibration(factor: float) -> None:
    global _K_2D_FDM_CALIB
    _K_2D_FDM_CALIB = float(np.clip(factor, 0.1, 250.0))


def get_fdm_k_2d_calibration() -> float:
    return _K_2D_FDM_CALIB


def _current_amperes(current_ma: float) -> float:
    return max(float(current_ma), 1e-3) / 1000.0


def apparent_resistivity_ohm_m(
    layout: ElectrodeLayout,
    delta_v_volts: float,
    current_ma: float,
    *,
    k_extra: float = 1.0,
) -> float:
    """
    ρa = k_extra · K · |ΔV| / I  com ΔV em volts e I em amperes.
    (Equivalente a K·|ΔV_mV|/I_mA usado em SOLODATA/RES2DINV.)
    """
    i_a = _current_amperes(current_ma)
    k = k_extra * float(layout.k_geom)
    return max(k * abs(float(delta_v_volts)) / i_a, 1e-6)


def estimate_fdm_k_2d_calibration(
    mesh: Mesh2D,
    reading_dicts: list[dict],
    rho_ref_ohm: float,
) -> float:
    """
    Factor para ρa_FDM ≈ ρ_ref em meio uniforme (corrige mal condicionada 2D).
    Mediana de ρ_ref / ρa_bruto por leitura.
    """
    rho_ref = max(float(rho_ref_ohm), 1e-3)
    m_uni = np.full(mesh.nx * mesh.nz, rho_ohm_to_m_ln(rho_ref), dtype=float)
    ratios: list[float] = []
    for r in reading_dicts:
        station = float(r["station_m"])
        n = int(r["n"])
        a_m = float(r["a_m"])
        i_ma = float(r.get("i_ma") or 50.0)
        layout = electrode_layout(station, n, a_m)
        sigma = _conductivity_from_log10(m_uni, mesh)
        mat, rhs = _build_system(sigma, mesh)
        i_a = _current_amperes(i_ma)
        _inject_source(rhs, mesh, layout.a_x, +i_a)
        _inject_source(rhs, mesh, layout.b_x, -i_a)
        try:
            phi = spsolve(mat, rhs)
        except Exception:
            continue
        dv = _potential_at(mesh, phi, layout.m_x) - _potential_at(
            mesh, phi, layout.n_x
        )
        rho_raw = apparent_resistivity_ohm_m(
            layout, dv, i_ma, k_extra=1.0
        )
        if rho_raw > 1e-6 and np.isfinite(rho_raw):
            ratios.append(rho_ref / rho_raw)
    if not ratios:
        return 1.0
    # Média (não mediana) — algumas estações têm ΔV pequeno e ratio alto.
    return float(np.clip(float(np.median(ratios)), 0.15, 35.0))


def electrode_layout(station_m: float, n: int, a_m: float) -> ElectrodeLayout:
    """Arranjo dipolo-dipolo colinear (perfil 2D) + K SOLODATA."""
    a = max(a_m, 0.5)
    sep = max(n, 1) * a
    m_x = station_m - 0.5 * a
    n_x = station_m + 0.5 * a
    a_x = station_m - sep - 0.5 * a
    b_x = station_m + sep + 0.5 * a
    k_geom = geometric_factor_dipolo_dipolo(a, n)
    return ElectrodeLayout(a_x=a_x, b_x=b_x, m_x=m_x, n_x=n_x, k_geom=k_geom)


def _surface_layer_index(mesh: Mesh2D, i: int) -> int:
    for j in range(mesh.nz):
        if mesh.active[i, j]:
            return j
    return 0


def _nearest_node(mesh: Mesh2D, x: float, z: float = 0.0) -> tuple[int, int] | None:
    if x < mesh.x0 or x > mesh.x1:
        return None
    i = int(np.clip(np.searchsorted(mesh.x_centers, x), 0, mesh.nx - 1))
    if mesh.x_centers[i] > x and i > 0:
        i -= 1
    j = int(np.clip(np.searchsorted(mesh.z_centers, max(z, mesh.surface_z[i])), 0, mesh.nz - 1))
    if not mesh.active[i, j]:
        for jj in range(mesh.nz):
            if mesh.active[i, jj]:
                j = jj
                break
        else:
            return None
    return i, j


def _surface_phi_profile(mesh: Mesh2D, phi: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Potencial na camada superficial por coluna (para interpolação em M/N)."""
    xs = writable(mesh.x_centers)
    vals = np.zeros(mesh.nx, dtype=float)
    for i in range(mesh.nx):
        j = _surface_layer_index(mesh, i)
        vals[i] = float(phi[idx(i, j, mesh.nz)])
    return xs, vals


def _conductivity_from_log10(m_log10: np.ndarray, mesh: Mesh2D) -> np.ndarray:
    """Compat: interpreta m como ln(ρ) se |m|>6, senão legado log₁₀(ρ)."""
    m = writable(m_log10)
    sample = float(m[0]) if m.size else 0.0
    if abs(sample) > 6.0:
        return conductivity_from_m_ln(m, mesh)
    m_ln = m * LN10
    return conductivity_from_m_ln(m_ln, mesh)


def _build_system(sigma: np.ndarray, mesh: Mesh2D) -> tuple[sparse.csr_matrix, np.ndarray]:
    nx, nz = mesh.nx, mesh.nz
    n = nx * nz
    rows: list[int] = []
    cols: list[int] = []
    data: list[float] = []
    rhs = np.zeros(n, dtype=float)

    dx = (mesh.x1 - mesh.x0) / max(nx, 1)
    dz = mesh.z_max / max(nz, 1)

    def add(i: int, j: int, val: float) -> None:
        if 0 <= i < nx and 0 <= j < nz and mesh.active[i, j]:
            rows.append(idx(i, j, nz))
            cols.append(idx(i, j, nz))
            data.append(val)

    for i in range(nx):
        for j in range(nz):
            if not mesh.active[i, j]:
                add(i, j, 1.0)
                continue
            s_c = sigma[i, j]
            diag = 0.0
            neighbors: list[tuple[int, int, float]] = []

            if i + 1 < nx and mesh.active[i + 1, j]:
                s_e = 2.0 * s_c * sigma[i + 1, j] / (s_c + sigma[i + 1, j] + 1e-12)
                c = s_e / (dx * dx)
                neighbors.append((i + 1, j, c))
                diag += c
            if i > 0 and mesh.active[i - 1, j]:
                s_w = 2.0 * s_c * sigma[i - 1, j] / (s_c + sigma[i - 1, j] + 1e-12)
                c = s_w / (dx * dx)
                neighbors.append((i - 1, j, c))
                diag += c
            if j + 1 < nz and mesh.active[i, j + 1]:
                s_s = 2.0 * s_c * sigma[i, j + 1] / (s_c + sigma[i, j + 1] + 1e-12)
                c = s_s / (dz * dz)
                neighbors.append((i, j + 1, c))
                diag += c
            if j > 0 and mesh.active[i, j - 1]:
                s_n = 2.0 * s_c * sigma[i, j - 1] / (s_c + sigma[i, j - 1] + 1e-12)
                c = s_n / (dz * dz)
                neighbors.append((i, j - 1, c))
                diag += c

            if j == 0 or (j > 0 and not mesh.active[i, j - 1]):
                diag += s_c / (dz * dz) * 4.0

            add(i, j, diag)
            for ni, nj, c in neighbors:
                rows.append(idx(i, j, nz))
                cols.append(idx(ni, nj, nz))
                data.append(-c)

    mat = sparse.csr_matrix((data, (rows, cols)), shape=(n, n))
    return _pin_reference_potential(mat, rhs, mesh)


def _pin_reference_potential(
    mat: sparse.csr_matrix,
    rhs: np.ndarray,
    mesh: Mesh2D,
) -> tuple[sparse.csr_matrix, np.ndarray]:
    """Fixa φ=0 num nó activo na superfície (evita matriz singular Neumann)."""
    pin: int | None = None
    i_mid = mesh.nx // 2
    for j in range(mesh.nz):
        if mesh.active[i_mid, j]:
            pin = idx(i_mid, j, mesh.nz)
            break
    if pin is None:
        for i in range(mesh.nx):
            for j in range(mesh.nz):
                if mesh.active[i, j]:
                    pin = idx(i, j, mesh.nz)
                    break
            if pin is not None:
                break
    if pin is None:
        return mat, rhs
    mat = mat.tolil()
    mat[pin, :] = 0.0
    mat[:, pin] = 0.0
    mat[pin, pin] = 1.0
    rhs = rhs.copy()
    rhs[pin] = 0.0
    return mat.tocsr(), rhs


def _inject_source(rhs: np.ndarray, mesh: Mesh2D, x_pos: float, current: float) -> None:
    node = _nearest_node(mesh, x_pos, z=mesh.surface_z.min())
    if node is None:
        return
    i, j = node
    rhs[idx(i, j, mesh.nz)] += current


def _mean_active_resistivity(m_log10: np.ndarray, mesh: Mesh2D) -> float:
    """ρ média (Ω·m); m = ln(ρ)."""
    return mean_resistivity_ohm(m_log10, mesh)


def _homogeneous_rho_raw(
    mesh: Mesh2D,
    layout: ElectrodeLayout,
    current_ma: float,
    rho_ref: float = 50.0,
) -> float:
    """ρa bruto (FDM 2D) em meio uniforme — calibração SOLODATA K + escala ρ."""
    m_uni = np.full(mesh.nx * mesh.nz, rho_ohm_to_m_ln(max(rho_ref, 1e-6)), dtype=float)
    sigma = conductivity_from_m_ln(m_uni, mesh)
    mat, rhs = _build_system(sigma, mesh)
    i_a = max(current_ma, 1e-3) / 1000.0
    _inject_source(rhs, mesh, layout.a_x, +i_a)
    _inject_source(rhs, mesh, layout.b_x, -i_a)
    try:
        phi = spsolve(mat, rhs)
    except Exception:
        return rho_ref
    delta_v = _potential_at(mesh, phi, layout.m_x) - _potential_at(
        mesh, phi, layout.n_x
    )
    return apparent_resistivity_ohm_m(
        layout, delta_v, current_ma, k_extra=_K_2D_FDM_CALIB
    )


def _apparent_rho_raw_ohm_m(
    layout: ElectrodeLayout,
    delta_v: float,
    current_ma: float,
) -> float:
    """ρa bruta com K SOLODATA + correcção 2D FDM."""
    return apparent_resistivity_ohm_m(
        layout, delta_v, current_ma, k_extra=_K_2D_FDM_CALIB
    )


def _apparent_rho_ohm_m(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    layout: ElectrodeLayout,
    delta_v: float,
    current_ma: float,
) -> float:
    """ρa (Ω·m) com K SOLODATA e escala σ média (2D FDM vs arranjo 3D)."""
    rho_raw = _apparent_rho_raw_ohm_m(layout, delta_v, current_ma)
    rho_mean = _mean_active_resistivity(m_log10, mesh)
    rho_ref = _homogeneous_rho_raw(mesh, layout, current_ma, rho_ref=rho_mean)
    rho_a = rho_raw * (rho_mean / max(rho_ref, 1e-12))
    return max(float(rho_a), 1e-6)


def forward_reading_log10_raw(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    station_m: float,
    n: int,
    a_m: float,
    current_ma: float = 50.0,
) -> float:
    """log₁₀(ρa); m = ln(ρ) nas células."""
    sigma = conductivity_from_m_ln(writable(m_log10), mesh)
    mat, rhs = _build_system(sigma, mesh)
    layout = electrode_layout(station_m, n, a_m)
    i_a = _current_amperes(current_ma)
    _inject_source(rhs, mesh, layout.a_x, +i_a)
    _inject_source(rhs, mesh, layout.b_x, -i_a)
    try:
        phi = spsolve(mat, rhs)
    except Exception:
        return float(np.mean(m_log10)) / LN10
    v_m = _potential_at(mesh, phi, layout.m_x)
    v_n = _potential_at(mesh, phi, layout.n_x)
    delta_v = v_m - v_n
    rho_a = _apparent_rho_raw_ohm_m(layout, delta_v, current_ma)
    return float(np.log10(rho_a))


def forward_log10_raw(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
) -> np.ndarray:
    """Forward em log₁₀ ρa sem factor dinâmico ρ_mean/ρ_ref."""
    m_log10 = writable(m_log10)
    out = np.zeros(len(readings), dtype=float)
    for k, r in enumerate(readings):
        i_ma = r.get("i_ma")
        current = float(i_ma) if i_ma and i_ma > 0 else 50.0
        out[k] = forward_reading_log10_raw(
            m_log10,
            mesh,
            float(r["station_m"]),
            int(r["n"]),
            float(r["a_m"]),
            current_ma=current,
        )
    return out


def _potential_at(mesh: Mesh2D, phi: np.ndarray, x_pos: float) -> float:
    """Interpola φ na superfície ao longo de x (M/N não podem partilhar o mesmo nó)."""
    if x_pos < mesh.x0 or x_pos > mesh.x1:
        return 0.0
    xs, vals = _surface_phi_profile(mesh, phi)
    if xs.size < 2:
        return float(vals[0]) if vals.size else 0.0
    return float(np.interp(x_pos, xs, vals))


def forward_reading_log10(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    station_m: float,
    n: int,
    a_m: float,
    current_ma: float = 50.0,
) -> float:
    sigma = _conductivity_from_log10(m_log10, mesh)
    mat, rhs = _build_system(sigma, mesh)
    layout = electrode_layout(station_m, n, a_m)
    i_a = _current_amperes(current_ma)
    _inject_source(rhs, mesh, layout.a_x, +i_a)
    _inject_source(rhs, mesh, layout.b_x, -i_a)
    try:
        phi = spsolve(mat, rhs)
    except Exception:
        return float(np.mean(m_log10))
    v_m = _potential_at(mesh, phi, layout.m_x)
    v_n = _potential_at(mesh, phi, layout.n_x)
    delta_v = v_m - v_n
    rho_a = _apparent_rho_ohm_m(m_log10, mesh, layout, delta_v, current_ma)
    return float(np.log10(rho_a))


def forward_log10(
    m_log10: np.ndarray,
    mesh: Mesh2D,
    readings: list[dict],
) -> np.ndarray:
    m_log10 = writable(m_log10)
    out = np.zeros(len(readings), dtype=float)
    for k, r in enumerate(readings):
        i_ma = r.get("i_ma")
        current = float(i_ma) if i_ma and i_ma > 0 else 50.0
        out[k] = forward_reading_log10(
            m_log10,
            mesh,
            float(r["station_m"]),
            int(r["n"]),
            float(r["a_m"]),
            current_ma=current,
        )
    return out
