"""Terminal de perguntas sobre geologia."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.services.geology_chat import answer_geology_question, context_from_lithology_row

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class GeologyAskRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    lon: float | None = None
    lat: float | None = None
    context: dict | None = None
    history: list[ChatMessage] = Field(default_factory=list)


@router.get("/chat/status")
async def geology_chat_status():
    key = bool((settings.openai_api_key or "").strip())
    return {
        "aiEnabled": key,
        "model": settings.openai_model if key else None,
        "hint": (
            "Modo offline: respostas a partir dos dados CPRM/SGB do mapa."
            if not key
            else f"IA activa ({settings.openai_model})."
        ),
        "setup": (
            "Crie hidrogeo-brasil/backend/.env com OPENAI_API_KEY=sk-... e reinicie a API (porta 8010)."
            if not key
            else None
        ),
    }


@router.post("/chat/ask")
async def geology_chat_ask(body: GeologyAskRequest, db: AsyncSession = Depends(get_db)):
    ctx = body.context

    if body.lon is not None and body.lat is not None and (not ctx or ctx.get("layer") != "lithology"):
        q = text(
            """
            SELECT id, unit_name, rock_type, age, description, attrs
            FROM geo.lithology
            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326))
            LIMIT 1
            """
        )
        row = (await db.execute(q, {"lon": body.lon, "lat": body.lat})).mappings().first()
        if row:
            ctx = context_from_lithology_row(dict(row), body.lon, body.lat)
        elif not ctx:
            ctx = {"lon": body.lon, "lat": body.lat}

    result = await answer_geology_question(
        body.message,
        context=ctx,
        history=[h.model_dump() for h in body.history],
    )
    return {
        **result,
        "contextUsed": ctx,
    }
