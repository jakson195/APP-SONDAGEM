from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("HidroAlerta API a arrancar")
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health")
def health():
    return {"status": "ok", "service": "hidroalerta-api"}


@app.post("/api/v1/ingestion/trigger")
def trigger_ingestion():
    """Dispara ingestão manual (dev). Usa Celery se Redis disponível."""
    import redis

    from app.core.config import settings
    from app.ingestion.celery_app import ingest_all

    try:
        client = redis.from_url(settings.redis_url, socket_connect_timeout=1)
        client.ping()
        task = ingest_all.delay()
        return {"task_id": task.id, "status": "queued"}
    except Exception:
        result = ingest_all()
        return {"status": "completed_inline", "result": result}
