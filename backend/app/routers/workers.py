import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.branch import Branch
from app.models.worker import Worker

router = APIRouter(prefix="/workers", tags=["workers"])


class WorkerCreate(BaseModel):
    name: str
    phone_number: str
    branch_id: uuid.UUID
    title: str | None = None


class WorkerUpdate(BaseModel):
    title: str | None = None


@router.get("/branches")
async def list_branches(session: AsyncSession = Depends(get_db)) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Branch)
        .where(Branch.company_id == company_id)
        .order_by(Branch.name)
    )
    branches = result.scalars().all()
    return {"branches": [{"id": str(b.id), "name": b.name} for b in branches]}


@router.post("", status_code=201)
async def create_worker(
    body: WorkerCreate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    worker = Worker(
        company_id=company_id,
        branch_id=body.branch_id,
        name=body.name.strip(),
        phone_number=body.phone_number.strip(),
        title=body.title.strip() if body.title else None,
        active=True,
    )
    session.add(worker)
    await session.commit()
    await session.refresh(worker)
    return {"id": str(worker.id), "name": worker.name}


@router.patch("/{worker_id}", status_code=200)
async def update_worker(
    worker_id: uuid.UUID,
    body: WorkerUpdate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Worker).where(
            Worker.id == worker_id,
            Worker.company_id == company_id,
        )
    )
    worker = result.scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    worker.title = body.title.strip() if body.title else None
    await session.commit()
    return {"ok": True}


@router.delete("/{worker_id}", status_code=200)
async def deactivate_worker(
    worker_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Worker).where(
            Worker.id == worker_id,
            Worker.company_id == company_id,
        )
    )
    worker = result.scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    worker.active = False
    await session.commit()
    return {"ok": True}
