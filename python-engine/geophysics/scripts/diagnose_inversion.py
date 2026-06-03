#!/usr/bin/env python3
"""
Diagnóstico de inversão: sweep λ, métodos (sem reg / L2 / L1 / blocky),
modelo sintético 2 camadas (100 vs 3000 Ω·m).

Uso:
  cd python-engine/geophysics
  python scripts/diagnose_inversion.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from schemas.invert_2d import Invert2DRequest, InvertParamsIn, ReadingIn
from services.inversion.invert_2d import run_invert_2d
from services.inversion.mesh import build_mesh, idx
from services.inversion.fdm_forward import forward_log10


def build_two_layer_model(
    mesh,
    rho_top: float,
    rho_bottom: float,
    z_interface_frac: float = 0.45,
) -> np.ndarray:
    """m = log10(rho) com interface horizontal."""
    m = np.zeros(mesh.nx * mesh.nz, dtype=float)
    z_cut = mesh.z_max * z_interface_frac
    for i in range(mesh.nx):
        for j in range(mesh.nz):
            zc = mesh.z_centers[j]
            rho = rho_top if zc < z_cut else rho_bottom
            m[idx(i, j, mesh.nz)] = np.log10(rho)
    return m


def synthetic_readings(
    mesh,
    m_true: np.ndarray,
    n_stations: int = 14,
    n_level: int = 3,
    a_m: float = 5.0,
    noise_pct: float = 3.0,
) -> list[ReadingIn]:
    rd = []
    x0, x1 = float(mesh.x0), float(mesh.x1)
    stations = np.linspace(x0 + 10, x1 - 10, n_stations)
    rng = np.random.default_rng(42)
    for station in stations:
        d = {
            "station_m": float(station),
            "n": n_level,
            "a_m": a_m,
            "i_ma": 50.0,
        }
        log_rho = forward_log10(m_true, mesh, [d])[0]
        rho = 10 ** log_rho
        if noise_pct > 0:
            rho *= 1.0 + rng.normal(0, noise_pct / 100.0)
        rd.append(
            ReadingIn(
                station_m=float(station),
                n=n_level,
                a_m=a_m,
                rho_ohm_m=max(float(rho), 1.0),
                i_ma=50.0,
            )
        )
    return rd


def run_case(
    label: str,
    readings: list[ReadingIn],
    method: str,
    lambda_reg: float,
    lambda_z: float = 0.12,
    lambda_x: float = 0.02,
    nx: int = 32,
    nz: int = 20,
) -> dict:
    params = InvertParamsIn(
        nx=nx,
        nz=nz,
        lambda_reg=lambda_reg,
        lambda_x=lambda_x,
        lambda_z=lambda_z,
        max_iter=12,
        use_adaptive_mesh=False,
        reg_normalize_mesh=True,
        irls_inner_iters=4,
        min_iter_before_stop=3,
        target_rms_log10=0.02,
    )
    req = Invert2DRequest(readings=readings, params=params, method=method)  # type: ignore[arg-type]
    out = run_invert_2d(req)
    rho = np.array([10 ** v for v in out.m_log10])
    return {
        "label": label,
        "method": method,
        "lambda": lambda_reg,
        "rho_min": float(rho.min()),
        "rho_max": float(rho.max()),
        "rho_std": float(np.std(rho)),
        "ratio": float(rho.max() / max(rho.min(), 1e-6)),
        "rms_pct": out.rms_percent,
        "mesh": f"{out.nx}x{out.nz}",
    }


def main() -> None:
    print("=" * 72)
    print("SYNTHETIC 2-LAYER: top=100 Ohm.m  bottom=3000 Ohm.m")
    print("=" * 72)

    x0, x1, z_max = 0.0, 120.0, 25.0
    mesh = build_mesh(x0, x1, z_max, 32, 20, None, geometric_z=True)
    m_true = build_two_layer_model(mesh, 100.0, 3000.0)
    readings = synthetic_readings(mesh, m_true, noise_pct=2.0)
    obs = [r.rho_ohm_m for r in readings]
    print(f"  Synthetic rho_obs min/max: {min(obs):.1f} / {max(obs):.1f}")

    # Forward FDM com n=3 malha 32x20 mal vê camada profunda — teste B com rhoa imposta.
    print("\n--- Teste B: rhoa 100 vs 3000 (contraste nos dados) ---")
    stations = np.linspace(x0 + 10, x1 - 10, 14)
    readings_b = [
        ReadingIn(
            station_m=float(s),
            n=3,
            a_m=5.0,
            rho_ohm_m=100.0 if i < 7 else 3000.0,
            i_ma=50.0,
        )
        for i, s in enumerate(stations)
    ]

    lambdas = [1.0, 0.3, 0.1, 0.03, 0.01, 0.0]
    methods = [
        ("gauss_newton", "L2 GN"),
        ("robust_l1", "L1 IRLS"),
        ("blocky_l1", "Blocky L1"),
    ]

    results: list[dict] = []
    for lam in lambdas:
        for mid, mname in methods:
            label = f"lam={lam:g} {mname}"
            try:
                r = run_case(label, readings, mid, lam)
                results.append(r)
                print(
                    f"  {label:22s}  rho {r['rho_min']:8.1f}-{r['rho_max']:8.1f}  "
                    f"std={r['rho_std']:8.1f}  ratio={r['ratio']:.2f}  rms={r['rms_pct']:.1f}%"
                )
            except Exception as exc:
                print(f"  {label:22s}  FAILED: {exc}")

    for lam in [0.1, 0.03, 0.01]:
        for mid, mname in methods:
            label = f"B lam={lam:g} {mname}"
            try:
                r = run_case(label, readings_b, mid, lam)
                results.append(r)
                print(
                    f"  {label:22s}  rho {r['rho_min']:8.1f}-{r['rho_max']:8.1f}  "
                    f"std={r['rho_std']:8.1f}  ratio={r['ratio']:.2f}  rms={r['rms_pct']:.1f}%"
                )
            except Exception as exc:
                print(f"  {label:22s}  FAILED: {exc}")

    print("\n" + "=" * 72)
    print("BEST CONTRAST (max rho_max/rho_min with rms<25%):")
    ok = [r for r in results if r["rms_pct"] < 25 and r["ratio"] > 1.5]
    ok.sort(key=lambda x: -x["ratio"])
    for r in ok[:5]:
        print(f"  {r['label']:22s}  ratio={r['ratio']:.2f}  std={r['rho_std']:.1f}")


if __name__ == "__main__":
    main()
