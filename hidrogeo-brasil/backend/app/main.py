from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import export, geology_chat, hydro, layers, mining_leilao, search
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    import logging

    from app.api.mining_leilao import _run_predict, _run_seed_migrations

    logger = logging.getLogger(__name__)
    try:
        await asyncio.to_thread(_run_seed_migrations)
        await asyncio.to_thread(_run_predict)
        logger.info("Leilão SOPLE: migrações e previsão aplicadas no startup")
    except Exception as exc:
        logger.warning("Leilão SOPLE startup skip: %s", exc)
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(layers.router, prefix=f"{settings.api_prefix}/layers", tags=["layers"])
app.include_router(hydro.router, prefix=f"{settings.api_prefix}/hydro", tags=["hydro"])
app.include_router(geology_chat.router, prefix=f"{settings.api_prefix}/geology", tags=["geology"])
app.include_router(mining_leilao.router, prefix=f"{settings.api_prefix}/mining", tags=["mining"])
app.include_router(export.router, prefix=f"{settings.api_prefix}/export", tags=["export"])
app.include_router(search.router, prefix=f"{settings.api_prefix}/search", tags=["search"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "hidrogeo-brasil"}


@app.get(f"{settings.api_prefix}/config")
def public_config():
    return {
        "tileservUrl": settings.tileserv_url,
        "mapCenter": [-54.0, -14.0],
        "mapZoom": 3.5,
    }
