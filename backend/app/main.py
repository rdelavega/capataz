from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.dependencies import get_current_user
from app.routers import auth, dashboard, jobs, webhook, workers

app = FastAPI(title="Capataz API", version="0.1.0")

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
