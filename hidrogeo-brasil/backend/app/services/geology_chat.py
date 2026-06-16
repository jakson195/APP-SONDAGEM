"""Assistente de geologia — contexto CPRM/SGB + OpenAI opcional."""

from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import settings
from app.services.geology import build_geology_summary, enrich_lithology_feature

SYSTEM_PROMPT = """Você é um geólogo especialista em geologia do Brasil, cartografia CPRM/SGB e litologia regional.
Responda em português (Brasil), de forma clara e técnica mas acessível.
Use APENAS o contexto fornecido sobre o ponto/unidade geológica; se faltar informação, diga explicitamente.
Não invente siglas, idades ou litotipos que não estejam no contexto.
Mencione fonte CPRM/SGB quando relevante.
Respostas concisas (2–6 parágrafos curtos ou tópicos)."""


def _format_context(ctx: dict[str, Any] | None) -> str:
    if not ctx:
        return "Nenhum ponto ou unidade geológica selecionada no mapa."
    if ctx.get("geology_summary"):
        lines = [f"Resumo cartográfico: {ctx['geology_summary']}"]
    else:
        lines = []
    for key, label in (
        ("unit_name", "Unidade"),
        ("sigla", "Sigla"),
        ("rock_type", "Litotipos"),
        ("litotipos", "Litotipos"),
        ("age", "Idade"),
        ("ambiente_tectonico", "Ambiente tectônico"),
        ("description", "Legenda"),
        ("mapa_fonte", "Carta"),
        ("escala", "Escala"),
    ):
        val = ctx.get(key)
        if val:
            lines.append(f"{label}: {val}")
    if ctx.get("lon") is not None and ctx.get("lat") is not None:
        lines.append(f"Coordenadas: {ctx['lat']}, {ctx['lon']}")
    return "\n".join(lines) if lines else "Contexto geológico limitado."


def _fallback_answer(question: str, ctx: dict[str, Any] | None) -> str:
    q = question.lower()
    ctx_text = _format_context(ctx)

    if not ctx or not ctx.get("unit_name") and not ctx.get("geology_summary"):
        if any(w in q for w in ("granito", "basalto", "litolog", "rocha", "unidade", "cpm", "cprm")):
            return (
                "Clique numa área com a camada Litologia activa para carregar o contexto CPRM/SGB, "
                "ou pergunte de forma geral sobre o Brasil.\n\n"
                "Sem ponto seleccionado, posso explicar conceitos (litotipos, idade, ambiente tectônico), "
                "mas não consigo descrever a unidade local."
            )
        return (
            "Terminal de geologia HidroGeo — modo offline.\n\n"
            "Respondo com os dados CPRM/SGB do mapa. Para interpretação conversacional (GPT), "
            "defina OPENAI_API_KEY em hidrogeo-brasil/backend/.env e reinicie a API.\n\n"
            "Contexto actual:\n" + ctx_text
        )

    summary = ctx.get("geology_summary") or build_geology_summary(ctx)
    parts = [summary]

    if any(w in q for w in ("idade", "eó", "era", "período", "precambr", "meso", "cenozo")):
        age = ctx.get("age") or "—"
        parts.append(f"\n\nIdade: {age}")
    if any(w in q for w in ("litotip", "rocha", "granito", "basalto", "arenito", "gnaisse")):
        lit = ctx.get("litotipos") or ctx.get("rock_type") or "—"
        parts.append(f"\n\nLitotipos: {lit}")
    if any(w in q for w in ("tect", "ambiente", "colis", "subduc", "bacia")):
        amb = ctx.get("ambiente_tectonico") or "—"
        parts.append(f"\n\nAmbiente tectónico: {amb}")
    if any(w in q for w in ("sigla", "código", "codigo", "unidade")):
        parts.append(
            f"\n\nUnidade: {ctx.get('unit_name') or '—'} "
            f"({ctx.get('sigla') or 'sigla não informada'})"
        )

    return "".join(parts)


async def _call_openai(
    question: str,
    context: dict[str, Any] | None,
    history: list[dict[str, str]] | None,
) -> tuple[str | None, str | None]:
    key = (settings.openai_api_key or "").strip()
    if not key:
        return None, None

    ctx_block = _format_context(context)
    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in (history or [])[-6:]:
        role = h.get("role", "user")
        content = h.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    messages.append(
        {
            "role": "user",
            "content": f"Contexto geológico do mapa:\n{ctx_block}\n\nPergunta: {question}",
        }
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.openai_model,
                    "temperature": 0.35,
                    "messages": messages,
                },
            )
        if res.status_code != 200:
            detail = res.text[:200] if res.text else f"HTTP {res.status_code}"
            return None, detail
        data = res.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content")
        if not content:
            return None, "Resposta vazia da OpenAI"
        return content.strip(), None
    except httpx.HTTPError as exc:
        return None, str(exc)


async def answer_geology_question(
    question: str,
    *,
    context: dict[str, Any] | None = None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    question = question.strip()
    if not question:
        return {"answer": "Escreva uma pergunta sobre geologia.", "mode": "offline", "ai": False}

    ai_text, ai_error = await _call_openai(question, context, history)
    if ai_text:
        return {"answer": ai_text, "mode": "ai", "ai": True}

    key = bool((settings.openai_api_key or "").strip())
    fallback = _fallback_answer(question, context)
    if key and ai_error:
        fallback = (
            f"Não foi possível contactar a OpenAI ({ai_error}).\n\n"
            "Resposta offline a partir dos dados do mapa:\n\n" + fallback
        )

    return {
        "answer": fallback,
        "mode": "offline",
        "ai": False,
        "aiError": ai_error if key else None,
    }


def context_from_lithology_row(row: dict[str, Any], lon: float | None, lat: float | None) -> dict[str, Any]:
    enriched = enrich_lithology_feature(dict(row))
    attrs = enriched.get("attrs")
    if isinstance(attrs, str):
        try:
            attrs = json.loads(attrs)
        except json.JSONDecodeError:
            attrs = {}
    if not isinstance(attrs, dict):
        attrs = {}
    return {
        "layer": "lithology",
        "unit_name": enriched.get("unit_name"),
        "sigla": attrs.get("sigla"),
        "rock_type": enriched.get("rock_type"),
        "litotipos": attrs.get("litotipos"),
        "age": enriched.get("age"),
        "ambiente_tectonico": attrs.get("ambiente_tectonico"),
        "description": enriched.get("description"),
        "mapa_fonte": attrs.get("mapa"),
        "escala": attrs.get("escala"),
        "geology_summary": enriched.get("geology_summary"),
        "lon": lon,
        "lat": lat,
    }
