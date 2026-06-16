"""Arrays NumPy sempre graváveis — evita buffer read-only."""

from __future__ import annotations

from typing import Any

import numpy as np


def writable(x: Any, *, dtype: Any = float) -> np.ndarray:
    return np.array(x, dtype=dtype, copy=True)


def writable_int(x: Any) -> np.ndarray:
    return np.array(x, dtype=int, copy=True)
