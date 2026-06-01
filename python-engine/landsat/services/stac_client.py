"""Busca STAC — Planetary Computer (Landsat/S2) + Earth Search (arquivo 1972+)."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

EARTH_SEARCH = "https://earth-search.aws.element84.com/v1"
PLANETARY_COMPUTER = "https://planetarycomputer.microsoft.com/api/stac/v1"

# Landsat MSS/TM/ETM/OLI + Sentinel-2
COLLECTIONS = [
    "landsat-c2-l2",
    "landsat-c2-l1",
    "sentinel-2-l2a",
    "sentinel-2-l1c",
]

MSS_COLLECTIONS = ["landsat-c2-l1"]


def _platform_label(props: dict[str, Any], date: str) -> str:
    platform = props.get("platform") or props.get("constellation") or ""
    if platform:
        return str(platform)
    year = int(date[:4]) if len(date) >= 4 else 2000
    if year < 1984:
        return "Landsat 1-3 MSS"
    if year < 1999:
        return "Landsat 4-5 TM"
    if year < 2013:
        return "Landsat 7 ETM+"
    if year < 2021:
        return "Landsat 8 OLI/TIRS"
    if year < 2015:
        return "Landsat 8 OLI/TIRS"
    return "Landsat 9 / Sentinel-2"


def _visual_mode(date: str) -> str:
    try:
        year = int(date[:4])
    except ValueError:
        return "natural"
    return "grayscale" if year < 1999 else "natural"


def _provider_for_collection(collection: str) -> str:
    if collection.startswith("sentinel"):
        return "sentinel2"
    return "landsat"


def _configure_http_ssl() -> None:
    """Bundle CA (certifi) — evita SSLCertVerificationError no Windows/dev."""
    try:
        import certifi

        bundle = certifi.where()
    except ImportError:
        return
    os.environ.setdefault("SSL_CERT_FILE", bundle)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", bundle)


_ssl_verify_cache: bool | str | None = None


def ssl_verify() -> bool | str:
    """CA bundle, False (dev Windows) ou valor explícito via LANDSAT_SSL_VERIFY."""
    global _ssl_verify_cache
    if _ssl_verify_cache is not None:
        return _ssl_verify_cache

    raw = os.environ.get("LANDSAT_SSL_VERIFY", "auto").strip().lower()
    if raw in ("0", "false", "no", "off"):
        _ssl_verify_cache = False
        return _ssl_verify_cache
    if raw in ("1", "true", "yes", "on"):
        try:
            import certifi

            _ssl_verify_cache = certifi.where()
        except ImportError:
            _ssl_verify_cache = True
        return _ssl_verify_cache

    # auto: testa certifi; se falhar (comum no Windows dev), desliga verificação
    try:
        import certifi
        import httpx

        httpx.get(
            "https://earth-search.aws.element84.com/v1",
            verify=certifi.where(),
            timeout=8.0,
        )
        _ssl_verify_cache = certifi.where()
    except Exception:
        _ssl_verify_cache = False
    return _ssl_verify_cache


_configure_http_ssl()

STAC_HTTP_TIMEOUT = float(os.environ.get("LANDSAT_STAC_TIMEOUT", "25"))
SKIP_PLANETARY_COMPUTER = os.environ.get("LANDSAT_SKIP_PC", "1").strip().lower() in (
    "1",
    "true",
    "yes",
)
ENABLE_PC_SEARCH = os.environ.get("LANDSAT_PC_SEARCH", "0").strip().lower() in (
    "1",
    "true",
    "yes",
)


def _fetch_stac_items(
    *,
    catalog_url: str,
    source_key: str,
    collections: list[str],
    bbox_list: list[float],
    dt_range: str,
    query: dict[str, Any],
    max_items: int,
    modifier=None,
    timeout_sec: float = STAC_HTTP_TIMEOUT,
) -> list[dict[str, Any]]:
    """Consulta STAC — limita itens manualmente (PC pode paginar além de max_items)."""
    del timeout_sec  # HTTP timeout via StacApiIO
    cat = _open_catalog(catalog_url, modifier=modifier)
    search = cat.search(
        collections=collections,
        bbox=bbox_list,
        datetime=dt_range,
        query=query,
        max_items=max_items,
    )
    items: list[dict[str, Any]] = []
    for item in search.items():
        items.append(_item_to_record(item, source_key))
        if len(items) >= max_items:
            break
    return items


def _open_catalog(url: str, modifier=None):
    from copy import deepcopy

    from pystac_client import Client
    from pystac_client.exceptions import APIError
    from pystac_client.stac_api_io import StacApiIO
    from requests import Request

    verify = ssl_verify()

    class _StacIO(StacApiIO):
        def __init__(self) -> None:
            super().__init__(timeout=STAC_HTTP_TIMEOUT)
            self._verify = verify

        def request(
            self,
            href: str,
            method: str | None = None,
            headers: dict[str, str] | None = None,
            parameters: dict | None = None,
        ) -> str:
            if method == "POST":
                req = Request(method=method, url=href, headers=headers, json=parameters)
            else:
                params = deepcopy(parameters) or {}
                req = Request(method="GET", url=href, headers=headers, params=params)
            try:
                modified = self._req_modifier(req) if self._req_modifier else None
                prepped = self.session.prepare_request(modified or req)
                send_kwargs = self.session.merge_environment_settings(
                    prepped.url,
                    proxies={},
                    stream=None,
                    verify=self._verify,
                    cert=None,
                )
                resp = self.session.send(prepped, timeout=self.timeout, **send_kwargs)
            except Exception as err:
                raise APIError(str(err)) from err
            if resp.status_code != 200:
                raise APIError.from_response(resp)
            return resp.content.decode("utf-8")

    return Client.open(url, modifier=modifier, stac_io=_StacIO())


def search_scenes(
    bbox: dict[str, float],
    date_from: str,
    date_to: str,
    max_cloud_pct: float = 40.0,
    limit: int = 80,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    """Retorna (scenes, sources_used, warnings)."""
    warnings: list[str] = []
    sources: list[str] = []
    all_items: list[dict[str, Any]] = []

    bbox_list = [bbox["west"], bbox["south"], bbox["east"], bbox["north"]]
    dt_range = f"{date_from}T00:00:00Z/{date_to}T23:59:59Z"
    query = {"eo:cloud_cover": {"lt": max_cloud_pct}}

    # 1) Earth Search — catálogo estável (1972+ MSS/Landsat/S2)
    try:
        es_items = _fetch_stac_items(
            catalog_url=EARTH_SEARCH,
            source_key="earth_search",
            collections=COLLECTIONS,
            bbox_list=bbox_list,
            dt_range=dt_range,
            query=query,
            max_items=min(limit * 3, 100),
        )
        for rec in es_items:
            if not any(x["id"] == rec["id"] for x in all_items):
                all_items.append(rec)
        if es_items:
            sources.append("earth_search")
    except Exception as exc:
        warnings.append(f"Earth Search: {exc}")

    # 2) Planetary Computer — opcional (LANDSAT_PC_SEARCH=1); download usa PC sign
    if ENABLE_PC_SEARCH and not SKIP_PLANETARY_COMPUTER:
        try:
            import planetary_computer as pc

            pc_items = _fetch_stac_items(
                catalog_url=PLANETARY_COMPUTER,
                source_key="planetary_computer",
                collections=["landsat-c2-l2", "sentinel-2-l2a"],
                bbox_list=bbox_list,
                dt_range=dt_range,
                query=query,
                max_items=min(limit * 2, 30),
                modifier=pc.sign,
            )
            for rec in pc_items:
                if not any(x["id"] == rec["id"] for x in all_items):
                    all_items.append(rec)
            if pc_items:
                sources.append("planetary_computer")
        except Exception as exc:
            warnings.append(f"Planetary Computer: {exc}")

    sampled = _sample_one_per_year(all_items)
    return sampled[:limit], sources, warnings


def search_scenes_raw(
    bbox: dict[str, float],
    date_from: str,
    date_to: str,
    max_cloud_pct: float = 40.0,
    limit: int = 80,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    """Busca STAC sem amostragem anual."""
    warnings: list[str] = []
    sources: list[str] = []
    all_items: list[dict[str, Any]] = []

    bbox_list = [bbox["west"], bbox["south"], bbox["east"], bbox["north"]]
    dt_range = f"{date_from}T00:00:00Z/{date_to}T23:59:59Z"
    query = {"eo:cloud_cover": {"lt": max_cloud_pct}}

    try:
        es_items = _fetch_stac_items(
            catalog_url=EARTH_SEARCH,
            source_key="earth_search",
            collections=COLLECTIONS,
            bbox_list=bbox_list,
            dt_range=dt_range,
            query=query,
            max_items=min(limit * 3, 100),
        )
        all_items.extend(es_items)
        if es_items:
            sources.append("earth_search")
    except Exception as exc:
        warnings.append(f"Earth Search: {exc}")

    if ENABLE_PC_SEARCH and not SKIP_PLANETARY_COMPUTER:
        try:
            import planetary_computer as pc

            pc_items = _fetch_stac_items(
                catalog_url=PLANETARY_COMPUTER,
                source_key="planetary_computer",
                collections=["landsat-c2-l2", "sentinel-2-l2a"],
                bbox_list=bbox_list,
                dt_range=dt_range,
                query=query,
                max_items=min(limit * 3, 30),
                modifier=pc.sign,
            )
            for rec in pc_items:
                if not any(x["id"] == rec["id"] for x in all_items):
                    all_items.append(rec)
            if pc_items:
                sources.append("planetary_computer")
        except Exception as exc:
            warnings.append(f"Planetary Computer: {exc}")

    all_items.sort(
        key=lambda s: (
            s.get("cloud_cover_pct") if s.get("cloud_cover_pct") is not None else 100.0,
            s["date"],
        )
    )
    return all_items[:limit], sources, warnings


def search_scenes_for_year(
    bbox: dict[str, float],
    year: int,
    max_cloud_pct: float = 45.0,
    limit: int = 30,
) -> tuple[list[dict[str, Any]], list[str], list[str]]:
    """Cenas disponíveis num ano específico."""
    return search_scenes_raw(
        bbox=bbox,
        date_from=f"{year}-01-01",
        date_to=f"{year}-12-31",
        max_cloud_pct=max_cloud_pct,
        limit=limit,
    )


def _item_to_record(item, source: str) -> dict[str, Any]:
    props = item.properties or {}
    date = (props.get("datetime") or "")[:10]
    cloud = props.get("eo:cloud_cover")
    collection = item.collection_id or "unknown"
    self_href = item.self_href or item.get_self_href() or ""
    return {
        "id": item.id,
        "collection": collection,
        "provider": _provider_for_collection(collection),
        "satellite": _platform_label(props, date),
        "date": date,
        "cloud_cover_pct": float(cloud) if cloud is not None else None,
        "stac_item_url": self_href,
        "platform": props.get("platform"),
        "visual_mode": _visual_mode(date),
        "source": source,
    }


def _sample_one_per_year(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_year: dict[int, dict[str, Any]] = {}
    for rec in sorted(items, key=lambda x: x["date"]):
        try:
            year = int(rec["date"][:4])
        except (ValueError, IndexError):
            continue
        cloud = rec.get("cloud_cover_pct") if rec.get("cloud_cover_pct") is not None else 100.0
        prev = by_year.get(year)
        if prev is None or cloud < (prev.get("cloud_cover_pct") or 100.0):
            by_year[year] = rec
    return [by_year[y] for y in sorted(by_year)]


def resolve_scene_by_date(
    bbox: dict[str, float],
    date: str,
    max_cloud_pct: float = 55.0,
) -> dict[str, Any] | None:
    """Cena mais próxima de uma data (±120 dias)."""
    target = datetime.fromisoformat(f"{date[:10]}T12:00:00").replace(tzinfo=timezone.utc)
    start = target.replace(day=1)
    from datetime import timedelta

    dt_range = (
        f"{(target - timedelta(days=120)).isoformat().replace('+00:00', 'Z')}/"
        f"{(target + timedelta(days=120)).isoformat().replace('+00:00', 'Z')}"
    )
    scenes, _, _ = search_scenes(
        bbox=bbox,
        date_from=(target - timedelta(days=120)).strftime("%Y-%m-%d"),
        date_to=(target + timedelta(days=120)).strftime("%Y-%m-%d"),
        max_cloud_pct=max_cloud_pct,
        limit=30,
    )
    if not scenes:
        return None
    best = min(
        scenes,
        key=lambda s: abs(
            datetime.fromisoformat(f"{s['date']}T12:00:00").replace(tzinfo=timezone.utc).timestamp()
            - target.timestamp()
        ),
    )
    return best


def load_item_from_url(stac_item_url: str):
    import planetary_computer as pc
    import pystac

    item = pystac.Item.from_file(stac_item_url)
    try:
        return pc.sign(item)
    except Exception:
        return item


def asset_href(item, names: list[str]) -> str | None:
    assets = item.assets
    for name in names:
        if name in assets:
            href = assets[name].href
            if href:
                return href
    # common aliases Landsat C2
    aliases = {
        "red": ["SR_B4", "B4", "red"],
        "green": ["SR_B3", "B3", "green"],
        "blue": ["SR_B2", "B2", "blue"],
        "nir": ["SR_B5", "B5", "B8", "nir", "SR_B8"],
    }
    return None


def band_hrefs(item, rgb_nir: bool = True) -> dict[str, str | None]:
    assets = item.assets
    keys = list(assets.keys())

    def pick(*candidates: str) -> str | None:
        for c in candidates:
            if c in assets:
                return assets[c].href
        for k in keys:
            if any(c.lower() in k.lower() for c in candidates):
                return assets[k].href
        return None

    return {
        "red": pick("red", "SR_B4", "B4"),
        "green": pick("green", "SR_B3", "B3"),
        "blue": pick("blue", "blue", "SR_B2", "B2"),
        "nir": pick("nir", "SR_B5", "B8", "B5", "SR_B8"),
    }


def data_dir() -> str:
    root = os.environ.get("LANDSAT_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
    os.makedirs(root, exist_ok=True)
    return os.path.abspath(root)
