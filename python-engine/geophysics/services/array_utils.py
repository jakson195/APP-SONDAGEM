"""Arrays NumPy sempre graváveis — evita buffer read-only (PyGIMLi, pandas, scipy)."""

from __future__ import annotations

from typing import Any

import numpy as np


def writable(x: Any, *, dtype: Any = float) -> np.ndarray:
    """Cópia gravável; nunca view partilhada nem buffer read-only."""
    return np.array(x, dtype=dtype, copy=True)


def writable_int(x: Any) -> np.ndarray:
    return np.array(x, dtype=int, copy=True)


def writable_float64(x: Any) -> np.ndarray:
    return np.array(x, dtype=np.float64, copy=True)
