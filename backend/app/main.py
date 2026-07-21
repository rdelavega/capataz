from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import dashboard, webhook, workers

app = FastAPI(title="Capataz API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook.router)
app.include_router(dashboard.router)
app.include_router(workers.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
