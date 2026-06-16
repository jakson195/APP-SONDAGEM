"""Integrações opcionais: Sentinel Hub, GEE, INPE."""

from __future__ import annotations

import os


def sentinel_hub_configured() -> bool:
    return bool(
        os.environ.get("SENTINEL_HUB_CLIENT_ID", "").strip()
        and os.environ.get("SENTINEL_HUB_CLIENT_SECRET", "").strip()
    )


def gee_configured() -> bool:
    return bool(
        os.environ.get("GEE_SERVICE_ACCOUNT", "").strip()
        or os.environ.get("GEE_CREDENTIALS_PATH", "").strip()
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    )


def inpe_configured() -> bool:
    return bool(os.environ.get("INPE_API_TOKEN", "").strip())


def provider_status() -> dict[str, bool]:
    return {
        "planetary_computer": True,
        "earth_search": True,
        "sentinel_hub": sentinel_hub_configured(),
        "gee": gee_configured(),
        "inpe": inpe_configured(),
    }


def sentinel_hub_note() -> str | None:
    if sentinel_hub_configured():
        return None
    return "Sentinel Hub: configure SENTINEL_HUB_CLIENT_ID e SENTINEL_HUB_CLIENT_SECRET."


def gee_note() -> str | None:
    if gee_configured():
        return None
    return "GEE: configure GEE_SERVICE_ACCOUNT ou GOOGLE_APPLICATION_CREDENTIALS."


def inpe_note() -> str | None:
    if inpe_configured():
        return None
    return "INPE/CBERS: configure INPE_API_TOKEN para catálogo nacional."
