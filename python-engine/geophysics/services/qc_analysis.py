"""QC automático de dados geofísicos — SNR, spikes, FFT, ruído 50/60 Hz."""

from __future__ import annotations

import numpy as np
from scipy import signal as scipy_signal
from scipy.fft import rfft, rfftfreq


def _grade(snr: float) -> str:
    if snr > 10:
        return "green"
    if snr >= 4:
        return "yellow"
    return "red"


def analyze_line_qc(
    stations_m: list[float],
    rho_ohm_m: list[float],
    time_series: list[float] | None = None,
    sample_rate_hz: float | None = None,
) -> dict:
    rho = np.asarray(rho_ohm_m, dtype=np.float64)
    st = np.asarray(stations_m, dtype=np.float64)
    if rho.size == 0:
        return {"grade": "red", "snr": 0.0, "summary": "Sem dados"}

    log_r = np.log10(np.maximum(rho, 1e-6))
    smooth = scipy_signal.medfilt(log_r, kernel_size=min(5, max(3, rho.size | 1)))
    b, a = scipy_signal.butter(2, 0.25, btype="low")
    try:
        low = scipy_signal.filtfilt(b, a, log_r)
    except ValueError:
        low = smooth

    residual = log_r - smooth
    ps = float(np.mean(low**2))
    pn = float(np.mean(residual**2)) or 1e-14
    snr = float(np.sqrt(ps / pn))

    z = (residual - np.mean(residual)) / (np.std(residual) + 1e-12)
    spike_count = int(np.sum(np.abs(z) > 2.8))

    dx = float(np.mean(np.diff(st))) if st.size > 1 else 1.0
    fs = 1.0 / dx if dx > 0 else 1.0
    spec = np.abs(rfft(log_r - np.mean(log_r)))
    freqs = rfftfreq(log_r.size, d=1.0 / fs)
    total = float(np.sum(spec**2)) or 1.0
    high = float(np.sum(spec[len(spec) // 3 :] ** 2))
    spectral_noise = high / total

    p50 = p60 = 0.0
    if time_series and sample_rate_hz and len(time_series) >= 16:
        ts = np.asarray(time_series, dtype=np.float64)
        ts = ts - np.mean(ts)
        f = rfftfreq(ts.size, d=1.0 / sample_rate_hz)
        p = np.abs(rfft(ts)) ** 2
        tot = float(np.sum(p)) or 1.0
        p50 = float(np.sum(p[(f >= 48) & (f <= 52)])) / tot
        p60 = float(np.sum(p[(f >= 58) & (f <= 62)])) / tot

    return {
        "grade": _grade(snr),
        "snr": snr,
        "spike_count": spike_count,
        "spike_ratio": spike_count / rho.size,
        "amplitude_std": float(np.std(rho)),
        "amplitude_mean": float(np.mean(rho)),
        "stability_cv": float(np.std(rho) / (np.mean(rho) + 1e-12)),
        "max_abrupt_change": float(np.max(np.abs(np.diff(log_r))) if log_r.size > 1 else 0),
        "spectral_noise_index": spectral_noise,
        "power_line_50": p50,
        "power_line_60": p60,
        "residual": residual.tolist(),
        "filtered": smooth.tolist(),
    }
