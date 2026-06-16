"""Ponte para o motor existente em app-web/python-engine/geophysics."""

from __future__ import annotations

import sys
from pathlib import Path


def legacy_engine_root() -> Path:
    here = Path(__file__).resolve().parent
    candidates = [
        here.parents[1] / "app-web" / "python-engine" / "geophysics",
        here.parents[0] / ".." / "app-web" / "python-engine" / "geophysics",
    ]
    for p in candidates:
        resolved = p.resolve()
        if (resolved / "services").is_dir():
            return resolved
    raise RuntimeError(
        "Motor legado não encontrado em app-web/python-engine/geophysics"
    )


def ensure_legacy_path() -> Path:
    root = legacy_engine_root()
    s = str(root)
    if s not in sys.path:
        sys.path.insert(0, s)
    # Evita sombrear o pacote legado schemas/ pelo módulo local (api_schemas).
    cached = sys.modules.get("schemas")
    if cached is not None and not hasattr(cached, "__path__"):
        del sys.modules["schemas"]
    return root
