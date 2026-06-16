"""
DataGeo — engine científico oficial: ResIPy/R2 (Binley/Lancaster).

O DataGeo NÃO reimplementa o solver; delega mesh, inversão, regularização,
smoothing, contour, DOI e sensitivity ao ResIPy Project API.

Fluxo: POST /invert → run_resipy_invert() → Project.createMesh() → invert() → JSON.

Requer: pip install -r requirements-resipy.txt
Windows + Python 3.10–3.12 recomendado (numpy<2; Linux/macOS precisa Wine para R2).
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
import tempfile
import threading
import time
from typing import Callable

import numpy as np
import pandas as pd

from services.array_utils import writable, writable_int
from schemas.invert_2d import Invert2DRequest, Invert2DResponse, IterationRecordOut, MethodId
from .fdm_forward import electrode_layout
from .invert_common import (
    build_display_mesh,
    build_invert_response,
    prepare_inversion_data,
    resample_rho_to_display_grid,
    rms_metrics,
)
from .method_map import RESIPY_METHOD, RESIPY_METHOD_LABEL
from .model_clamp import clamp_m_log10

logger = logging.getLogger("geophysics.resipy_invert")

# ResIPy usa os.chdir (global) — uma inversão de cada vez evita invdir apagado em paralelo.
_RESIPY_LOCK = threading.Lock()

_RESIPY_OK: bool | None = None
_RESIPY_ERR: str | None = None


def is_resipy_available() -> bool:
    global _RESIPY_OK, _RESIPY_ERR
    if _RESIPY_OK is not None:
        return _RESIPY_OK
    try:
        from resipy import Project  # noqa: F401
        from resipy.Survey import Survey  # noqa: F401

        _RESIPY_OK = True
        _RESIPY_ERR = None
    except Exception as e:
        _RESIPY_OK = False
        _RESIPY_ERR = str(e)
    return _RESIPY_OK


def resipy_unavailable_reason() -> str | None:
    is_resipy_available()
    return _RESIPY_ERR


def _require_resipy():
    if not is_resipy_available():
        hint = (
            "ResIPy não disponível. "
            "pip install -r requirements-resipy.txt "
            f"(Python {sys.version_info.major}.{sys.version_info.minor}, numpy<2). "
        )
        if _RESIPY_ERR:
            hint += f"Detalhe: {_RESIPY_ERR}"
        raise ImportError(hint)


def _elevation_at_x(x: float, topo: list[tuple[float, float]] | None) -> float:
    if not topo or len(topo) < 2:
        return 0.0
    st = np.array([t[0] for t in topo], dtype=float)
    el = np.array([t[1] for t in topo], dtype=float)
    order = np.argsort(st)
    return float(np.interp(x, st[order], el[order]))


def _dedupe_topography(
    topo: list[tuple[float, float]],
    *,
    decimals: int = 4,
) -> list[tuple[float, float]]:
    """Um ponto por abscissa — evita nós de superfície repetidos no R2."""
    by_x: dict[float, float] = {}
    scale = 10**decimals
    for x, z in topo:
        if not (np.isfinite(x) and np.isfinite(z)):
            continue
        key = round(float(x) * scale) / scale
        by_x[key] = float(z)
    return sorted(by_x.items(), key=lambda t: t[0])


def _ensure_project_invdir(proj) -> None:
    """Garante que o working dir ResIPy (…/invdir) existe antes de invert/getResults."""
    wd = getattr(proj, "dirname", None)
    if not wd:
        return
    parent = os.path.dirname(wd)
    if parent:
        os.makedirs(parent, exist_ok=True)
    os.makedirs(wd, exist_ok=True)


def _cleanup_resipy_tmpdir(proj, tmpdir: str) -> None:
    """Espera o R2 terminar e só depois remove o diretório temporário."""
    if proj is not None:
        proc = getattr(proj, "proc", None)
        if proc is not None:
            try:
                proc.wait(timeout=30)
            except Exception:
                try:
                    proc.kill()
                    proc.wait(timeout=5)
                except Exception:
                    pass
    if tmpdir and os.path.isdir(tmpdir):
        for attempt in range(4):
            try:
                shutil.rmtree(tmpdir, ignore_errors=False)
                break
            except OSError as e:
                if attempt >= 3:
                    logger.warning("tmpdir ResIPy não removido (%s): %s", tmpdir, e)
                else:
                    time.sleep(0.25 * (attempt + 1))


def _mesh_surface_for_resipy(
    topo: list[tuple[float, float]] | None,
    elec: pd.DataFrame,
    *,
    tol_x: float = 0.02,
    tol_z: float = 0.05,
) -> np.ndarray | None:
    """
    Pontos extra de superfície para createMesh — exclui (x,z) já definidos
    nos eléctrodos. R2 falha se eléctrodo e topo partilham o mesmo nó.
    """
    if not topo or len(topo) < 2:
        return None

    clean = _dedupe_topography(topo)
    if len(clean) < 2:
        return None

    elec_x = writable(elec["x"].to_numpy(dtype=float))
    elec_z = writable(elec["z"].to_numpy(dtype=float))

    extra: list[list[float]] = []
    for x, z in clean:
        dup = False
        for ex, ez in zip(elec_x, elec_z, strict=False):
            if abs(x - ex) <= tol_x and abs(z - ez) <= tol_z:
                dup = True
                break
        if not dup:
            extra.append([x, z])

    if len(extra) < 2:
        return None
    return np.array(extra, dtype=float)


def _build_resipy_survey(
    active,
    reading_dicts: list[dict],
    topography: list[tuple[float, float]] | None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Electrodes + quadrupoles no formato ResIPy (labels string, coluna app)."""
    x_to_label: dict[float, str] = {}
    elec_rows: list[dict] = []

    def label_for(x: float) -> str:
        key = round(float(x), 4)
        if key not in x_to_label:
            lbl = str(len(x_to_label) + 1)
            x_to_label[key] = lbl
            elec_rows.append(
                {
                    "label": lbl,
                    "x": float(x),
                    "y": 0.0,
                    "z": _elevation_at_x(float(x), topography),
                    "buried": False,
                    "remote": False,
                }
            )
        return x_to_label[key]

    quad_rows: list[dict] = []
    for r, d in zip(active, reading_dicts):
        ly = electrode_layout(d["station_m"], d["n"], d["a_m"])
        quad_rows.append(
            {
                "a": label_for(ly.a_x),
                "b": label_for(ly.b_x),
                "m": label_for(ly.m_x),
                "n": label_for(ly.n_x),
                "app": float(r.rho_ohm_m),
            }
        )

    elec = pd.DataFrame(elec_rows)
    df = pd.DataFrame(quad_rows).astype({"a": str, "b": str, "m": str, "n": str})
    return elec, df


def _ensure_resipy_survey_columns(df: pd.DataFrame, elec: pd.DataFrame) -> pd.DataFrame:
    """
    Survey(df=, elec=) não converte app→resist antes de filterDefault.
    ρa (app) → factor geométrico K → resistência de transferência resist = app/K.
    """
    out = df.copy().astype({"a": str, "b": str, "m": str, "n": str})
    if "resist" in out.columns:
        return out
    if "app" not in out.columns:
        raise ValueError("DataFrame ResIPy precisa de coluna 'app' (ρa Ω·m).")

    label_to_idx = {
        str(lbl): i + 1 for i, lbl in enumerate(elec["label"].astype(str).tolist())
    }
    elec_xyz = elec[["x", "y", "z"]].values.astype(float)

    iseq = np.array(
        [
            [
                label_to_idx[str(row["a"])],
                label_to_idx[str(row["b"])],
                label_to_idx[str(row["m"])],
                label_to_idx[str(row["n"])],
            ]
            for _, row in out.iterrows()
        ],
        dtype=int,
    )
    array = iseq - 1
    apos = elec_xyz[array[:, 0]]
    bpos = elec_xyz[array[:, 1]]
    mpos = elec_xyz[array[:, 2]]
    npos = elec_xyz[array[:, 3]]

    AM = np.linalg.norm(apos - mpos, axis=1)
    BM = np.linalg.norm(bpos - mpos, axis=1)
    AN = np.linalg.norm(apos - npos, axis=1)
    BN = np.linalg.norm(bpos - npos, axis=1)
    for arr in (AM, BM, AN, BN):
        arr[arr == 0] = np.nan
    K = 2 * np.pi / ((1 / AM) - (1 / BM) - (1 / AN) + (1 / BN))
    out["K"] = writable(K)
    app = writable(out["app"].to_numpy(dtype=float))
    out["app"] = app
    out["resist"] = writable(app / out["K"].to_numpy(dtype=float))
    if "resError" not in out.columns:
        out["resError"] = np.nan
    # ERT DC — sem IP; ResIPy exige 'ip' se compRecip=True
    if "ip" not in out.columns:
        out["ip"] = 0.0
    if "phaseError" not in out.columns:
        out["phaseError"] = np.nan
    return _writable_resipy_dataframe(out)


def _resipy_inversion_params(
    req: Invert2DRequest,
    method: MethodId,
    reading_dicts: list[dict],
) -> tuple[dict, float]:
    cfg = RESIPY_METHOD.get(method, RESIPY_METHOD["gauss_newton"])
    p = req.params
    lam = max(float(p.lambda_reg), 1e-6)
    lx = max(float(p.lambda_x), 1e-8)
    lz = max(float(p.lambda_z), 1e-8)
    alpha_s = float(np.clip(lam * float(cfg["alpha_s_scale"]), 0.003, 0.35))
    alpha_aniso = float(np.clip((lz / lx) * float(cfg["aniso_scale"]), 0.4, 40.0))
    a_med = float(np.mean([d["a_m"] for d in reading_dicts] or [5.0]))
    n_max = max((d["n"] for d in reading_dicts), default=3)
    depth_factor = float(p.factor_depth)
    if getattr(p, "fast_invert", False):
        depth_factor = min(depth_factor, 0.22)
    fmd_auto = max(a_med * n_max * depth_factor, a_med * 2.0)
    fmd = float(p.mesh_fmd_m) if p.mesh_fmd_m is not None else fmd_auto
    if getattr(p, "fast_invert", False) and p.mesh_fmd_m is None:
        fmd = min(fmd, a_med * n_max * 0.22)

    # R2 usa tolerância como % RMS (recomendado >= 1.0); UI envia 0.02–0.5.
    r2_tolerance = float(p.tolerance)
    if r2_tolerance <= 0.5:
        r2_tolerance = 1.0

    inv_type = int(cfg["inverse_type"])
    # R2 v4.10: tipos 3 (robust) e 4 (blocky) falham na leitura de R2.in via ResIPy.
    if inv_type == 4:
        inv_type = 2  # Gauss-Newton — melhor contraste estável
    elif inv_type == 3:
        inv_type = 1  # regularized L2 robusto
    reg_mode = 0

    param: dict = {
        "inverse_type": inv_type,
        "alpha_s": round(alpha_s, 4),
        "alpha_aniso": round(alpha_aniso, 4),
        "max_iter": (
            min(int(p.max_iter), 8)
            if getattr(p, "fast_invert", False)
            else int(p.max_iter)
        ),
        "a_wgt": float(p.a_wgt if p.a_wgt is not None else cfg.get("a_wgt", 0.03)),
        "b_wgt": float(p.b_wgt if p.b_wgt is not None else cfg.get("b_wgt", 0.0)),
        "rho_min": float(p.rho_min_ohm_m),
        "rho_max": float(p.rho_max_ohm_m),
        "tolerance": r2_tolerance,
        "reg_mode": reg_mode,
        "data_type": 1,
        "error_mod": 2,
    }
    if method == "occam":
        param["target_decrease"] = 0.1
        param["qual_ratio"] = 0.1
    return param, fmd


def _mesh_resistivity_column(mesh) -> str:
    for name in mesh.df.columns:
        if "Resistivity" in str(name):
            return str(name)
    raise ValueError(f"Coluna de resistividade não encontrada: {list(mesh.df.columns)}")


def _mesh_centroids(mesh) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    res_name = _mesh_resistivity_column(mesh)
    df = mesh.df
    x_cols = [c for c in ("x", "X", "cx", "centroid_x") if c in df.columns]
    z_cols = [c for c in ("z", "Z", "cz", "centroid_z") if c in df.columns]
    if x_cols and z_cols:
        x = writable(df[x_cols[0]].to_numpy(dtype=float))
        z = writable(df[z_cols[0]].to_numpy(dtype=float))
    elif hasattr(mesh, "node") and hasattr(mesh, "connection"):
        conn = writable_int(mesh.connection)
        nodes = writable(mesh.node)
        tri = nodes[conn]
        x = np.mean(tri[:, 0], axis=1)
        z = np.mean(tri[:, 2] if tri.shape[2] > 2 else tri[:, 1], axis=1)
    else:
        raise ValueError("Malha ResIPy sem coordenadas de célula reconhecíveis.")
    rho = writable(df[res_name].to_numpy(dtype=float))
    ok = np.isfinite(x) & np.isfinite(z) & np.isfinite(rho) & (rho > 0)
    return x[ok], z[ok], rho[ok]


def _build_mesh_interpolator(mesh) -> Callable[[float, float], float]:
    from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator

    x, z, rho = _mesh_centroids(mesh)
    if x.size < 4:
        med = float(np.median(rho)) if rho.size else 100.0
        return lambda _x, _z: med
    try:
        interp = LinearNDInterpolator(np.c_[x, z], rho, fill_value=np.nan)
    except Exception:
        interp = NearestNDInterpolator(np.c_[x, z], rho)

    def sample(xq: float, zq: float) -> float:
        val = float(interp(xq, zq))
        if not np.isfinite(val) or val <= 0:
            nn = NearestNDInterpolator(np.c_[x, z], rho)
            val = float(nn(xq, zq))
        return val

    return sample


def _read_synthetic_log10(dirname: str, n_data: int, y_obs: np.ndarray) -> np.ndarray:
    err_path = os.path.join(dirname, "f001_err.dat")
    if not os.path.isfile(err_path):
        return y_obs.copy()
    try:
        errdf = np.genfromtxt(err_path, skip_header=1)
        if errdf.ndim == 1:
            errdf = errdf.reshape(1, -1)
        if errdf.shape[0] < n_data or errdf.shape[1] < 7:
            return y_obs.copy()
        rcal = errdf[:n_data, 6]
        rcal = np.maximum(rcal, 1e-6)
        return np.log10(rcal)
    except Exception as e:
        logger.debug("f001_err.dat indisponível: %s", e)
        return y_obs.copy()


def _iteration_history_from_pinfo(
    pinfo: dict,
    lam: float,
    y_obs: np.ndarray,
    y_syn: np.ndarray,
    m_log10: np.ndarray,
) -> list[IterationRecordOut]:
    n_iters = int(pinfo.get("Number of iterations", 1) or 1)
    rms_pct = pinfo.get("RMS error as percentage estimate")
    rms_log10, rms_percent = rms_metrics(y_obs, y_syn)
    if isinstance(rms_pct, (int, float)) and np.isfinite(rms_pct):
        rms_percent = float(rms_pct)
    rho = 10.0**m_log10[np.isfinite(m_log10)]
    rec = IterationRecordOut(
        iter=max(n_iters, 1),
        rms_log10=rms_log10,
        rms_percent=rms_percent,
        lambda_reg=lam,
        phi=rms_log10,
        roughness_l2=float(np.std(m_log10[np.isfinite(m_log10)])),
        relative_gain=None,
        rho_min_ohm_m=float(np.min(rho)) if rho.size else None,
        rho_max_ohm_m=float(np.max(rho)) if rho.size else None,
        rho_std_ohm_m=float(np.std(rho)) if rho.size else None,
    )
    return [rec]


_NUMERIC_RESIPY_COLS = (
    "app",
    "resist",
    "K",
    "ip",
    "resError",
    "phaseError",
    "recipMean",
    "recipError",
    "recipMean0",
)


def _writable_resipy_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Cópias graváveis — ResIPy Cython (computeRecip) falha com buffer read-only."""
    out = df.copy()
    for col in _NUMERIC_RESIPY_COLS:
        if col not in out.columns:
            continue
        out[col] = writable(out[col].to_numpy(dtype=float))
    return out


def _ensure_resipy_writable_arrays(survey) -> None:
    """Garante df/isequence graváveis antes de computeReciprocal (Cython)."""
    survey.df = _writable_resipy_dataframe(survey.df)
    if getattr(survey, "isequence", None) is not None:
        survey.isequence = writable_int(survey.isequence)


def _finalize_resipy_survey_columns(survey) -> None:
    """Colunas que ResIPy/R2 espera em protocol.dat (não criadas sem reciprocals)."""
    df = survey.df
    if "irecip" not in df.columns:
        df["irecip"] = 0
    if "recipMean" not in df.columns:
        df["recipMean"] = df["resist"].values
    if "recipError" not in df.columns:
        df["recipError"] = np.nan
    if "recipMean0" not in df.columns:
        df["recipMean0"] = np.nan
    survey.df = df


def _apply_resipy_data_filters(survey, req: Invert2DRequest) -> None:
    """Filtros estilo ResIPy antes da inversão."""
    p = req.params
    df = survey.df
    if p.filter_negative:
        bad = df["app"] <= 0
        if bad.any():
            df.loc[bad, "app"] = np.nan
    if p.filter_duplicates:
        dup = df.duplicated(subset=["a", "b", "m", "n"], keep="first")
        if dup.any():
            df.drop(df.index[dup], inplace=True)
            df.reset_index(drop=True, inplace=True)
    if p.filter_pct_error is not None and "recipMean" in df.columns:
        n_recip = 0
        if "irecip" in df.columns:
            n_recip = int((df["irecip"] != 0).sum())
        if n_recip >= 2:
            thr = float(p.filter_pct_error) / 100.0
            with np.errstate(divide="ignore", invalid="ignore"):
                err = np.abs(df["app"] - df["recipMean"]) / np.maximum(
                    np.abs(df["app"]), 1e-6
                )
            bad = err > thr
            if bad.any():
                df.drop(df.index[bad], inplace=True)
                df.reset_index(drop=True, inplace=True)
        else:
            logger.debug(
                "filter_pct_error ignorado: sem pares recíprocos (%d leituras)",
                len(df),
            )
    survey.df = df


def run_resipy_invert(req: Invert2DRequest) -> Invert2DResponse:
    _require_resipy()
    from resipy import Project
    from resipy.Survey import Survey

    method = req.method
    active, y_obs, w, reading_dicts, excluded, x0, x1 = prepare_inversion_data(req)
    display_mesh = build_display_mesh(req, x0, x1, reading_dicts)

    topo = (
        _dedupe_topography(
            [(p.station_m, p.elevation_m) for p in req.topography],
        )
        if req.topography
        else None
    )
    elec, df = _build_resipy_survey(active, reading_dicts, topo)
    df = _ensure_resipy_survey_columns(df, elec)
    inv_param, fmd = _resipy_inversion_params(req, method, reading_dicts)
    lam = float(inv_param["alpha_s"])

    tmpdir = tempfile.mkdtemp(prefix="datageo_resipy_")
    proj: Project | None = None
    progress: list[str] = []

    def _stage(msg: str) -> None:
        progress.append(msg)
        logger.info("resipy: %s", msg)

    with _RESIPY_LOCK:
        try:
            _stage("A preparar survey ResIPy")
            proj = Project(dirname=tmpdir, typ="R2")
            comp_recip = bool(req.params.filter_reciprocal)
            # compRecip=False no construtor: reciprocals só após arrays graváveis
            # (Cython computeRecip falha com "buffer source array is read-only").
            survey = Survey(df=df, elec=elec, compRecip=False, debug=False)
            _ensure_resipy_writable_arrays(survey)
            if comp_recip:
                try:
                    # "Pandas Merge" evita Cython computeRecip (buffer read-only).
                    survey.computeReciprocal(alg="Pandas Merge")
                except Exception as e:
                    logger.warning("reciprocal skip: %s", e)
            _apply_resipy_data_filters(survey, req)
            _finalize_resipy_survey_columns(survey)
            if len(survey.df) < 4:
                raise ValueError("Filtros ResIPy removeram demasiados pontos (< 4).")
            proj.surveys.append(survey)
            proj.setElec(elec)
            proj.pinfo["Data"] = True

            surface = _mesh_surface_for_resipy(topo, elec)

            mesh_typ = req.params.mesh_type
            cl_factor = float(req.params.mesh_cl_factor)
            if getattr(req.params, "fast_invert", False):
                cl_factor = max(cl_factor, 5.0)
            refine = int(req.params.mesh_refine)
            if getattr(req.params, "fast_invert", False):
                refine = 0
            _stage(
                f"A criar malha {mesh_typ} (cl_factor={cl_factor:.1f}, fmd={fmd:.1f} m)"
            )
            mesh_args = dict(
                typ=mesh_typ,
                fmd=fmd,
                surface=surface,
                cl_factor=cl_factor,
                refine=refine,
                show_output=False,
            )
            try:
                proj.createMesh(cl=1.0, **mesh_args)
            except TypeError:
                proj.createMesh(**mesh_args)
            _stage("Malha triangular criada")
            a_wgt = float(inv_param.get("a_wgt", 0.03))
            b_wgt = float(inv_param.get("b_wgt", 0.0))
            if np.isnan(survey.df["resError"]).all() and (a_wgt > 0 or b_wgt > 0):
                proj.estimateError(a_wgt=a_wgt, b_wgt=b_wgt)
            inv_kw: dict = {
                "iplot": False,
                "err": not np.isnan(survey.df["resError"]).all(),
            }
            if req.params.doi_estimate:
                inv_kw["modelDOI"] = True
            _ensure_project_invdir(proj)
            _stage(
                f"A inverter R2 (Gauss-Newton, max_iter={inv_param['max_iter']})"
            )
            proj.invert(param=inv_param, **inv_kw)
            _stage("Inversão R2 concluída")

            if not proj.meshResults:
                _ensure_project_invdir(proj)
                try:
                    proj.getResults()
                except (IndexError, ValueError, OSError) as e:
                    raise RuntimeError(
                        "ResIPy/R2 não concluiu a inversão. Verifique dados (≥4 leituras), "
                        "cR2.exe e logs no terminal do motor."
                    ) from e
            if not proj.meshResults:
                hint = (
                    " Tente «Gauss-Newton L2» ou «Blocky L1»."
                    if method == "occam"
                    else ""
                )
                raise RuntimeError(
                    f"ResIPy/R2 não devolveu malha invertida (inversão não convergiu).{hint}"
                )

            mesh = proj.meshResults[0]
            _stage("A resamplear modelo para grelha de exibição")
            interp_fn = _build_mesh_interpolator(mesh)
            m_log10 = resample_rho_to_display_grid(interp_fn, display_mesh)
            _stage("A finalizar resposta JSON")
            m_log10 = clamp_m_log10(
                m_log10,
                req.params.rho_min_ohm_m,
                req.params.rho_max_ohm_m,
            )
            y_syn = _read_synthetic_log10(proj.dirname, len(y_obs), y_obs)
            history = _iteration_history_from_pinfo(
                proj.pinfo, lam, y_obs, y_syn, m_log10
            )
            label = RESIPY_METHOD_LABEL.get(method, f"ResIPy R2 ({method})")
            rms_note = proj.pinfo.get("RMS of inverse solution")
            msg_extra = f", RMS R2={rms_note}" if rms_note else ""

            return build_invert_response(
                req=req,
                engine="resipy",
                method=method,
                method_label=label,
                forward_model="fdm",
                display_mesh=display_mesh,
                m_log10=m_log10,
                y_obs=y_obs,
                y_syn=y_syn,
                reading_dicts=reading_dicts,
                excluded=excluded,
                data_weights=w.tolist(),
                iterations=len(history),
                iteration_history=history,
                lambda_reg=lam,
                message=(
                    f"Inversão ResIPy R2 — α_s={lam:.4g}, α_aniso={inv_param['alpha_aniso']:.2g}, "
                    f"tipo={inv_param['inverse_type']}, malha {mesh_typ}, "
                    f"ρ=[{req.params.rho_min_ohm_m:.2g},{req.params.rho_max_ohm_m:.2g}] Ω·m, "
                    f"grid {display_mesh.nx}×{display_mesh.nz}{msg_extra}"
                ),
                progress_log=progress,
            )
        finally:
            _cleanup_resipy_tmpdir(proj, tmpdir)
