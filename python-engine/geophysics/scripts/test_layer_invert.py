#!/usr/bin/env python3
"""Teste: forward 2 camadas (100/3000 Ω·m) → inversão (GN + blocky_l1)."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from schemas.invert_2d import Invert2DRequest, InvertParamsIn, ReadingIn
from services.inversion.invert_2d import run_invert_2d
from services.inversion.pygimli_invert import is_pygimli_available
from services.inversion.mesh import build_mesh, idx
from services.inversion.fdm_forward import forward_log10_raw


def build_two_layer(mesh, rho_top: float, rho_bot: float, z_frac: float = 0.45):
    m = np.zeros(mesh.nx * mesh.nz, dtype=float)
    z_cut = mesh.z_max * z_frac
    for i in range(mesh.nx):
        for j in range(mesh.nz):
            rho = rho_top if mesh.z_centers[j] < z_cut else rho_bot
            m[idx(i, j, mesh.nz)] = np.log10(rho)
    return m


def synthetic_readings(mesh, m_true, n_stations: int = 10):
    readings = []
    rng = np.random.default_rng(42)
    for st in np.linspace(12, 108, n_stations):
        d = {"station_m": float(st), "n": 3, "a_m": 5.0, "i_ma": 50.0}
        log_r = forward_log10_raw(m_true, mesh, [d])[0]
        rho = 10 ** log_r * (1.0 + rng.normal(0, 0.02))
        readings.append(
            ReadingIn(
                station_m=float(st),
                n=3,
                a_m=5.0,
                rho_ohm_m=max(float(rho), 1e-3),
                i_ma=50.0,
            )
        )
    return readings


def run_case(method: str, lam: float, max_iter: int = 8) -> bool:
    mesh = build_mesh(0, 120, 16, 10, 10, None, geometric_z=True)
    m_true = build_two_layer(mesh, 100.0, 3000.0)
    readings = synthetic_readings(mesh, m_true, n_stations=8)
    base = dict(
        nx=16,
        nz=10,
        lambda_reg=lam,
        lambda_x=0.01,
        lambda_z=0.05,
        max_iter=max_iter,
        forward_model="fdm",
        jacobian_mode="fd",
        use_adaptive_mesh=False,
        apply_coverage_mask=False,
        auto_exclude_outliers=False,
        irls_inner_iters=2,
        reg_normalize_mesh=True,
        min_iter_before_stop=2,
        trust_region_alpha=0.35,
    )
    if method == "gauss_newton":
        base["use_line_search"] = False
    else:
        base["use_line_search"] = True

    req = Invert2DRequest(
        readings=readings,
        method=method,
        params=InvertParamsIn(**base),
        invert_engine="legacy",
    )
    out = run_invert_2d(req)
    rho = np.array([10 ** v for v in out.m_log10])
    ratio = rho.max() / max(rho.min(), 1e-6)
    ok = ratio > 3 and rho.std() > 12
    print(
        f"[{method}] lam={lam} rho {rho.min():.0f}-{rho.max():.0f} "
        f"std={rho.std():.0f} ratio={ratio:.1f} rms%={out.rms_percent:.1f} "
        f"iters={out.iterations} {'PASS' if ok else 'FAIL'}"
    )
    return ok


def main() -> int:
    ok = True
    print(f"pyGIMLi instalado: {is_pygimli_available()}")
    for lam in (0.01, 0.03, 0.1):
        ok = run_case("gauss_newton", lam, max_iter=6) and ok
    ok = run_case("blocky_l1", 0.03, max_iter=6) and ok
    if is_pygimli_available():
        print("\n--- pyGIMLi (mesmo sintético) ---")
        mesh = build_mesh(0, 120, 16, 10, 10, None, geometric_z=True)
        m_true = build_two_layer(mesh, 100.0, 3000.0)
        readings = synthetic_readings(mesh, m_true, n_stations=8)
        req = Invert2DRequest(
            readings=readings,
            method="gauss_newton",
            invert_engine="pygimli",
            params=InvertParamsIn(
                nx=16,
                nz=10,
                lambda_reg=0.03,
                max_iter=8,
                forward_model="fdm",
                use_adaptive_mesh=False,
                apply_coverage_mask=False,
                auto_exclude_outliers=False,
            ),
        )
        out = run_invert_2d(req)
        rho = np.array([10 ** v for v in out.m_log10])
        ratio = rho.max() / max(rho.min(), 1e-6)
        pg_ok = ratio > 3 and rho.std() > 12
        print(
            f"[pygimli] engine={out.engine} rho {rho.min():.0f}-{rho.max():.0f} "
            f"rms%={out.rms_percent:.1f} {'PASS' if pg_ok else 'FAIL'}"
        )
        ok = pg_ok and ok
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
