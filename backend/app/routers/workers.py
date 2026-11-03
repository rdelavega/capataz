import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.branch import Branch
from app.models.event import Event
from app.models.worker import Worker
from app.phone import normalize_phone
from app.services import insights, notify
from app.timeutil import local_date

router = APIRouter(prefix="/workers", tags=["workers"])


class WorkerCreate(BaseModel):
    name: str
    phone_number: str
    branch_id: uuid.UUID
    title: str | None = None


class WorkerUpdate(BaseModel):
    title: str | None = None


class BranchCreate(BaseModel):
    name: str


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


@router.post("/branches", status_code=201)
async def create_branch(
    body: BranchCreate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    branch = Branch(company_id=company_id, name=body.name.strip())
    session.add(branch)
    await session.commit()
    await session.refresh(branch)
    return {"id": str(branch.id), "name": branch.name}


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
        phone_number=normalize_phone(body.phone_number),
        title=body.title.strip() if body.title else None,
        active=True,
    )
    session.add(worker)
    try:
        await session.commit()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Ese número ya está registrado")
    await session.refresh(worker)
    return {"id": str(worker.id), "name": worker.name}


@router.get("/{worker_id}/summary")
async def worker_summary(
    worker_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Ficha del trabajador: mes, calendario, lo que hizo hoy, tareas y fotos."""
    company_id = uuid.UUID(settings.company_id)
    worker = (await session.execute(
        select(Worker).where(Worker.id == worker_id, Worker.company_id == company_id)
    )).scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    s = await insights.load_snapshot(session, company_id)
    if worker not in s.workers:
        s.workers.append(worker)  # inactivo: igual mostramos su historial

    events_today = list((await session.execute(
        select(Event).where(Event.worker_id == worker.id, local_date(Event.received_at) == s.today)
    )).scalars())
    photo_filter = (Event.worker_id == worker.id, Event.event_type == "photo", Event.media_url.is_not(None))
    photos = list((await session.execute(
        select(Event).where(*photo_filter).order_by(Event.received_at.desc()).limit(6)
    )).scalars())
    photo_total = (await session.execute(select(func.count(Event.id)).where(*photo_filter))).scalar_one()

    return insights.worker_summary(s, worker, events_today, photos, photo_total)


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


@router.post("/{worker_id}/remind", status_code=200)
async def remind_worker(
    worker_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Worker).where(
            Worker.id == worker_id,
            Worker.company_id == company_id,
            Worker.active == True,
        )
    )
    worker = result.scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    try:
        await notify.checkin_reminder(session, company_id, worker)
    except notify.NoWindow as e:
        raise HTTPException(
            status_code=409,
            detail="No ha escrito en 24 h y WhatsApp no deja mandarle mensaje. Escríbele desde tu celular.",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail="WhatsApp no dejó mandar el mensaje. Escríbele desde tu celular.",
        ) from e
    await session.commit()
    return {"ok": True}
