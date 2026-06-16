"""Texto descritivo da geologia CPRM/SGB a partir de atributos da litologia."""

from __future__ import annotations

import json
from typing import Any


def _s(val: Any) -> str:
    if val is None:
        return ""
    t = str(val).strip()
    return t if t.lower() not in ("none", "nan", "null") else ""


def _attrs(raw: dict[str, Any]) -> dict[str, Any]:
    a = raw.get("attrs")
    if isinstance(a, dict):
        return a
    if isinstance(a, str) and a:
        try:
            parsed = json.loads(a)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    return {}


def build_age_label(raw: dict[str, Any], attrs: dict[str, Any]) -> str:
    for key in ("age", "range", "idade"):
        v = _s(raw.get(key) or attrs.get(key))
        if v:
            return v

    parts: list[str] = []
    for lo, hi, label in (
        ("eon_min", "eon_max", "Eon"),
        ("era_min", "era_max", "Era"),
        ("sistema_min", "sistema_max", "Sistema"),
        ("epoca_min", "epoca_max", "Época"),
    ):
        a = _s(attrs.get(lo) or raw.get(lo))
        b = _s(attrs.get(hi) or raw.get(hi))
        if a or b:
            span = a if a == b or not b else f"{a} – {b}" if a and b else (a or b)
            parts.append(span)

    return " · ".join(parts)


def build_geology_summary(raw: dict[str, Any]) -> str:
    """Parágrafo legível para popup ao clicar no mapa."""
    attrs = _attrs(raw)
    sigla = _s(attrs.get("sigla") or raw.get("sigla"))
    nome = _s(raw.get("unit_name") or attrs.get("nome") or raw.get("name"))
    litotipos = _s(raw.get("rock_type") or attrs.get("litotipos"))
    legenda = _s(raw.get("description") or attrs.get("legenda"))
    ambiente = _s(attrs.get("ambiente_tectonico"))
    sub_amb = _s(attrs.get("sub_ambiente_tectonico"))
    mapa = _s(attrs.get("mapa"))
    escala = _s(attrs.get("escala"))
    hierarquia = _s(attrs.get("hierarquia"))
    age = build_age_label(raw, attrs)

    title = nome or "Unidade litostratigráfica"
    if sigla and sigla not in title:
        title = f"{sigla} — {title}"

    parts: list[str] = [f"Neste ponto, a cartografia geológica CPRM/SGB indica a unidade {title}."]

    if litotipos:
        parts.append(f"Litotipos dominantes: {litotipos}.")
    if age:
        parts.append(f"Idade geológica: {age}.")
    if ambiente:
        ctx = ambiente
        if sub_amb and sub_amb != ambiente:
            ctx = f"{ambiente} ({sub_amb})"
        parts.append(f"Contexto tectônico: {ctx}.")
    if hierarquia and hierarquia.lower() not in ("não definida", "nao definida"):
        parts.append(f"Hierarquia estratigráfica: {hierarquia}.")
    if legenda:
        parts.append(legenda.rstrip(".") + ".")
    if mapa or escala:
        src = mapa or "Mapa Geológico do Brasil"
        if escala:
            src = f"{src} ({escala})"
        parts.append(f"Fonte cartográfica: {src}.")

    return " ".join(parts)


def enrich_lithology_feature(raw: dict[str, Any]) -> dict[str, Any]:
    """Normaliza feição litológica + resumo para a API."""
    attrs = _attrs(raw)
    out = dict(raw)
    out["source"] = out.get("source") or "CPRM/SGB — GeoSGB"
    out["geology_summary"] = build_geology_summary({**raw, "attrs": attrs or raw.get("attrs")})
    if not out.get("rock_type"):
        out["rock_type"] = _s(attrs.get("litotipos"))
    if not out.get("age"):
        out["age"] = build_age_label(raw, attrs)
    if not out.get("description"):
        out["description"] = _s(attrs.get("legenda"))
    return out
