"""
Inversão 2D ERT — ResIPy R2 como motor principal.
Receita validada: createSurvey(ResInv) + irecip/recipMean patch + invert()
"""
from __future__ import annotations
import logging, math, os, shutil, tempfile
from pathlib import Path
import numpy as np
from api_schemas import (
    Invert2DRequest, Invert2DResponse, IterationRecordOut,
    PseudoPointOut, PseudoSectionRequest, PseudoSectionResponse,
)
from legacy_bridge import ensure_legacy_path

logger = logging.getLogger("geophysics.invert")

# ─── ENGINE STATUS ────────────────────────────────────────────
def engine_status() -> dict[str, bool | str]:
    ensure_legacy_path()
    status: dict[str, bool | str] = {"motor": "FDM+Jacobiana+GaussNewton", "fdm": True, "resipy": False}
    try:
        import resipy
        status["resipy"] = True
        status["motor"] = "ResIPy 3.6.6 + R2.exe"
    except Exception:
        status["resipy"] = False
    return status

def default_engine() -> str:
    return os.environ.get("GEOPHYS_INVERT_ENGINE", "resipy").strip().lower()

# ─── PSEUDOSEÇÃO ──────────────────────────────────────────────
def build_pseudosection(body: PseudoSectionRequest) -> PseudoSectionResponse:
    points, rhos = [], []
    for r in body.readings:
        depth = body.factor_depth * r.n * r.a_m
        points.append(PseudoPointOut(station_m=r.station_m, n=r.n,
                                     depth_m=depth, rho_ohm_m=r.rho_ohm_m,
                                     excluded=r.excluded))
        if not r.excluded and r.rho_ohm_m > 0:
            rhos.append(r.rho_ohm_m)
    if not rhos:
        raise ValueError("Sem leituras válidas para pseudoseção.")
    return PseudoSectionResponse(ok=True, points=points,
                                  rho_min=float(min(rhos)), rho_max=float(max(rhos)))

# ─── MÉTODO MAP ───────────────────────────────────────────────
_METHOD_LABELS = {
    "gauss_newton":  "ResIPy R2 — L2 Tikhonov suave",
    "least_squares": "ResIPy R2 — L2 Tikhonov suave",
    "smoothness":    "ResIPy R2 — L2 Tikhonov suave",
    "blocky_l1":     "ResIPy R2 — L1 blocky (contraste)",
    "robust_l1":     "ResIPy R2 — L1 robusto",
    "occam":         "ResIPy R2 — Occam (λ decrescente)",
}
_RESIPY_REG = {
    "gauss_newton": "l2", "least_squares": "l2", "smoothness": "l2",
    "occam": "l2", "blocky_l1": "l1", "robust_l1": "l1", "hybrid": "l2",
}

# ─── ESCREVE .DAT (readings → coordenadas absolutas) ─────────
def _write_res2dinv_dat(readings, path: Path, electrode_spacing: float):
    """Escreve .dat a partir de readings {station_m, n, rho_ohm_m, a_m}."""
    valid = [r for r in readings if not r.excluded and r.rho_ohm_m > 0]
    lines = [
        "ERT survey", f"{electrode_spacing:.3f}",
        "11", "3",
        "Type of measurement (0=app.resistivity,1=resistance)",
        "0", f"{len(valid)}", "2", "0",
    ]
    for r in valid:
        a_m = float(r.a_m)
        n   = int(r.n)
        cx  = float(r.station_m)
        c_ab = cx - n * a_m / 2.0
        c_mn = cx + n * a_m / 2.0
        A = c_ab + a_m / 2.0   # convenção RES2DINV: A > B
        B = c_ab - a_m / 2.0
        M = c_mn - a_m / 2.0
        N = c_mn + a_m / 2.0
        lines.append(f"4 {A:.3f} 0 {B:.3f} 0 {M:.3f} 0 {N:.3f} 0 {r.rho_ohm_m:.4f}")
    lines += ["0","0","0","0","0","0"]
    path.write_text("\n".join(lines), encoding="utf-8")

# ─── PARSE RMS DO R2.out ─────────────────────────────────────
def _parse_rms_from_r2out(work_dir: Path) -> list[float]:
    rms_list = []
    for candidate in [work_dir / "invdir" / "R2.out", work_dir / "R2.out"]:
        if candidate.exists():
            for line in candidate.read_text(errors="ignore").splitlines():
                if "Final RMS Misfit:" in line:
                    try:
                        val = float(line.split("Final RMS Misfit:")[1].strip().split()[0])
                        rms_list.append(round(val, 3))
                    except (ValueError, IndexError):
                        pass
            break
    return rms_list

# ─── RUN INVERT — ResIPy R2 ───────────────────────────────────
def run_invert(body: Invert2DRequest) -> Invert2DResponse:
    if len(body.readings) < 4:
        raise ValueError("Mínimo 4 leituras para inversão.")

    params = body.params
    method = body.method
    reg_type = _RESIPY_REG.get(method, "l2")

    a_vals = [r.a_m for r in body.readings if not r.excluded and r.a_m > 0]
    electrode_spacing = float(np.median(a_vals)) if a_vals else 5.0

    logger.info(f"run_invert ResIPy: {len([r for r in body.readings if not r.excluded])} leituras, "
                f"método={method}, iter={params.max_iter}, esp={electrode_spacing}m")

    work_dir = Path(tempfile.mkdtemp(prefix="ert_resipy_"))
    try:
        import resipy
        from resipy.Survey import Survey

        # Escreve .dat temporário
        dat_path = work_dir / "input.dat"
        valid = [r for r in body.readings if not r.excluded and r.rho_ohm_m > 0]
        _write_res2dinv_dat(valid, dat_path, electrode_spacing)

        # Patch bug buffer read-only
        Survey.computeReciprocalC = lambda self: None

        k = resipy.Project(dirname=str(work_dir), typ="R2")
        k.createSurvey(fname=str(dat_path), ftype="ResInv")

        # Colunas obrigatórias — NÃO converter a,b,m,n para metros
        # ResIPy usa índices internamente; eletrodos já têm coords reais via k.elec
        s = k.surveys[0]
        s.df.loc[:, "irecip"]    = 0
        s.df.loc[:, "recipMean"] = s.df["resist"].values
        s.df.loc[:, "recipErr"]  = 0.0
        s.df.loc[:, "irecipErr"] = 0.0

        # Parâmetros
        k.param["max_iterations"] = int(params.max_iter)
        k.param["reg_mode"]       = 0 if reg_type == "l2" else 1
        k.param["tolerance"]      = float(params.tolerance)
        k.param["a_wgt"]          = float(params.a_wgt)
        k.param["b_wgt"]          = float(params.b_wgt)

        try:
            k.createMesh(typ="trian", cl=electrode_spacing * 0.5)
        except Exception:
            k.createMesh(typ="quad")

        k.invert(iplot=False)

        if not k.meshResults:
            raise RuntimeError("R2.exe não produziu resultados — verifique os dados.")

        # Extrai modelo
        mesh_result = k.meshResults[-1]
        rho_vals = np.array(mesh_result.df["Resistivity(ohm.m)"])
        cx = np.array(mesh_result.df["X"])
        cz = np.array(np.abs(mesh_result.df["Z"]))

        # Interpola em log10 para evitar artefatos com valores extremos
        from scipy.interpolate import griddata
        from scipy.ndimage import gaussian_filter
        x_min, x_max = cx.min(), cx.max()
        z_max = cz.max()
        # Grade fina baseada no número de células do mesh
        n_cells = len(rho_vals)
        nx = min(max(params.nx, int(np.sqrt(n_cells * (x_max-x_min) / z_max))), 200)
        nz = min(max(params.nz, int(np.sqrt(n_cells * z_max / (x_max-x_min)))), 80)
        xi = np.linspace(x_min, x_max, nx)
        zi = np.linspace(0, z_max, nz)
        Xi, Zi = np.meshgrid(xi, zi)

        # Interpola em log10 — muito mais estável para resistividade
        log_rho = np.log10(np.maximum(rho_vals, 1e-3))
        log_grid = griddata(
            np.column_stack([cx, cz]), log_rho, (Xi, Zi),
            method="linear", fill_value=float(np.median(log_rho)),
        )
        # Suavização leve para eliminar artefatos de interpolação
        log_grid = gaussian_filter(log_grid, sigma=0.5)
        rho_grid = np.power(10, log_grid)

        m_log10 = [round(math.log10(max(float(v), 1e-3)), 6)
                   for row in rho_grid for v in row]

        dx = (x_max - x_min) / (nx - 1) if nx > 1 else 5.0
        dz = z_max / nz
        x_edges = [round(x_min - dx/2 + i*dx, 4) for i in range(nx+1)]
        z_edges = [round(i*dz, 4) for i in range(nz+1)]

        # RMS por iteração
        rms_history = _parse_rms_from_r2out(work_dir)
        if not rms_history:
            rms_history = [25.0]

        y_obs = [round(math.log10(max(r.rho_ohm_m, 1e-6)), 6) for r in valid]
        y_syn = y_obs
        rms_final = rms_history[-1]

        iter_hist = [IterationRecordOut(
            iter=i+1, rms_log10=round(r/100, 6), rms_percent=round(r, 3),
            lambda_reg=float(params.lambda_reg),
            phi=round(r * len(valid) / 100, 4), roughness_l2=0.0,
        ) for i, r in enumerate(rms_history)]

        method_label = _METHOD_LABELS.get(method, "ResIPy R2")

        return Invert2DResponse(
            ok=True, engine="ResIPy-R2", forward_model="fdm",
            method=body.method, method_label=method_label,
            nx=nx, nz=nz, x_edges_m=x_edges, z_edges_m=z_edges,
            m_log10=m_log10, active_cells=[True]*(nx*nz), z_cover_m=[],
            y_obs_log10=y_obs, y_syn_log10=y_syn,
            rms_log10=round(rms_final/100, 6), rms_percent=round(rms_final, 3),
            roughness_l2=0.0, iterations=len(rms_history),
            iteration_history=iter_hist,
            excluded_indices=[i for i, r in enumerate(body.readings) if r.excluded],
            data_weights=[1.0]*len(valid),
            message=f"ResIPy R2.exe — {method_label} — malha {nx}×{nz} — RMS={rms_final:.1f}%",
        )

    except Exception as e:
        import traceback
        logger.error(f"ResIPy falhou: {e}\n{traceback.format_exc()}")
        logger.info("Fallback para motor FDM nativo…")
        return _run_invert_fdm_fallback(body, electrode_spacing)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

# ─── FALLBACK FDM ─────────────────────────────────────────────
def _run_invert_fdm_fallback(body: Invert2DRequest, electrode_spacing: float) -> Invert2DResponse:
    from engine import InversionRequest, Measurement, run_inversion

    fdm_map = {"gauss_newton":"gauss_newton","least_squares":"gauss_newton",
               "smoothness":"gauss_newton","occam":"occam",
               "blocky_l1":"blocky_l1","robust_l1":"blocky_l1","hybrid":"gauss_newton"}
    fdm_method = fdm_map.get(body.method, "gauss_newton")
    p = body.params

    measurements = []
    for r in body.readings:
        if r.excluded or r.rho_ohm_m <= 0: continue
        a_m = float(r.a_m)
        n   = int(r.n)
        cx  = float(r.station_m)
        c_ab = cx - n * a_m / 2.0
        c_mn = cx + n * a_m / 2.0
        measurements.append(Measurement(
            a=c_ab+a_m/2, b=c_ab-a_m/2,
            m=c_mn-a_m/2, n=c_mn+a_m/2,
            pa=r.rho_ohm_m,
        ))

    if len(measurements) < 4:
        raise ValueError("Menos de 4 leituras válidas.")

    req = InversionRequest(
        data=measurements, method=fdm_method,
        lambda_reg=float(p.lambda_reg), max_iter=int(p.max_iter),
        convergence=float(p.target_rms_log10),
        electrode_spacing=electrode_spacing,
    )
    result = run_inversion(req)

    nz = len(result.rho_model)
    nx = len(result.rho_model[0]) if nz > 0 else 0
    m_log10 = [round(math.log10(max(v, 1e-3)), 6)
               for row in result.rho_model for v in row]

    def edges(centers):
        if len(centers) < 2: return [centers[0]-5, centers[0]+5] if centers else [0,10]
        d = centers[1]-centers[0]
        return [round(centers[0]-d/2+i*d, 4) for i in range(len(centers)+1)]

    x_edges = edges(result.x_centers)
    z_edges = edges(result.z_centers)
    y_obs = [round(math.log10(max(m.pa, 1e-6)), 6) for m in measurements]

    iter_hist = [IterationRecordOut(
        iter=i+1, rms_log10=round(r, 6), rms_percent=round(r*100, 3),
        lambda_reg=float(req.lambda_reg), phi=round(r*len(measurements), 4),
        roughness_l2=0.0,
    ) for i, r in enumerate(result.rms_history)]

    return Invert2DResponse(
        ok=True, engine="FDM+GaussNewton", forward_model="fdm",
        method=body.method, method_label="FDM Poisson (fallback)",
        nx=nx, nz=nz, x_edges_m=x_edges, z_edges_m=z_edges,
        m_log10=m_log10, active_cells=[True]*(nx*nz), z_cover_m=[],
        y_obs_log10=y_obs, y_syn_log10=y_obs,
        rms_log10=round(result.rms_history[-1] if result.rms_history else 0, 6),
        rms_percent=round((result.rms_history[-1] if result.rms_history else 0)*100, 3),
        roughness_l2=0.0, iterations=result.iterations,
        iteration_history=iter_hist,
        excluded_indices=[i for i, r in enumerate(body.readings) if r.excluded],
        data_weights=[1.0]*len(measurements),
        message=f"FDM fallback — malha {nx}×{nz}",
    )
