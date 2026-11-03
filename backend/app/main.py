import asyncio
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import engine
from app.dependencies import get_current_user
from app.migrations import run_migrations
from app.routers import auth, dashboard, jobs, webhook, workers
from app.services import scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    if not settings.whatsapp_app_secret:
        logger.error("WHATSAPP_APP_SECRET no configurado: el webhook acepta mensajes sin firma de Meta")
    try:
        await run_migrations(engine)
    except Exception:
        logger.exception("No se pudieron aplicar las migraciones")
    task = asyncio.create_task(scheduler.run_forever()) if settings.scheduler_enabled else None
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


# En producción no publicamos el mapa de la API (/docs, /openapi.json).
_in_railway = any(k.startswith("RAILWAY_ENVIRONMENT") for k in os.environ)
app = FastAPI(
    title="Capataz API", version="0.2.0", lifespan=lifespan,
    docs_url=None if _in_railway else "/docs",
    redoc_url=None if _in_railway else "/redoc",
    openapi_url=None if _in_railway else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook.router)
app.include_router(auth.router)
app.include_router(dashboard.router, dependencies=[Depends(get_current_user)])
app.include_router(workers.router,   dependencies=[Depends(get_current_user)])
app.include_router(jobs.router,      dependencies=[Depends(get_current_user)])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
