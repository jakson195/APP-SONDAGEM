#!/usr/bin/env python3
"""
Benchmark: motor legacy FDM vs pyGIMLi (mesmas leituras sintéticas).

Uso:
  cd app-web/python-engine/geophysics
  python scripts/benchmark_invert_engines.py
  python scripts/benchmark_invert_engines.py --dat caminho/res2dinv.dat  # futuro
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from schemas.invert_2d import Invert2DRequest, InvertParamsIn, ReadingIn
from services.inversion.invert_2d import run_invert_2d
from services.inversion.mesh import build_mesh, idx
from services.inversion.fdm_forward import forward_log10_raw
from services.inversion.pygimli_invert import is_pygimli_available


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


def run_engine(engine: str, method: str = "gauss_newton") -> dict:
    mesh = build_mesh(0, 120, 16, 10, 10, None, geometric_z=True)
    m_true = build_two_layer(mesh, 100.0, 3000.0)
    readings = synthetic_readings(mesh, m_true, n_stations=8)
    params = InvertParamsIn(
        nx=16,
        nz=10,
        lambda_reg=0.03,
        lambda_x=0.01,
        lambda_z=0.05,
        max_iter=8,
        forward_model="fdm",
        use_adaptive_mesh=False,
        apply_coverage_mask=False,
        auto_exclude_outliers=False,
        use_line_search=method != "gauss_newton",
    )
    req = Invert2DRequest(
        readings=readings,
        method=method,
        params=params,
        invert_engine=engine,  # type: ignore[arg-type]
    )
    out = run_invert_2d(req)
    rho = np.array([10 ** v for v in out.m_log10])
    return {
        "engine": out.engine,
        "method": out.method,
        "rms_percent": out.rms_percent,
        "rho_min": float(rho.min()),
        "rho_max": float(rho.max()),
        "rho_std": float(rho.std()),
        "ratio": float(rho.max() / max(rho.min(), 1e-6)),
        "message": out.message,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--method", default="gauss_newton")
    args = parser.parse_args()

    print("=== Benchmark inversão 2D (100 / 3000 Ω·m) ===\n")
    print(f"pyGIMLi instalado: {is_pygimli_available()}\n")

    legacy = run_engine("legacy", args.method)
    print("[legacy FDM]")
    for k, v in legacy.items():
        print(f"  {k}: {v}")

    if is_pygimli_available():
        print()
        pg_out = run_engine("pygimli", args.method)
        print("[pyGIMLi]")
        for k, v in pg_out.items():
            print(f"  {k}: {v}")
        print(
            f"\nΔ RMS%: {pg_out['rms_percent'] - legacy['rms_percent']:.2f} "
            f"(pyGIMLi − legacy)"
        )
    else:
        print("\n[pyGIMLi] omitido — instale: pip install pygimli")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
