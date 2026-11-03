import logging
import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.branch import Branch
from app.models.job import Job
from app.models.worker import Worker
from app.services import insights, notify, whatsapp
from app.timeutil import local_today

router = APIRouter(prefix="/jobs", tags=["jobs"])
logger = logging.getLogger(__name__)

VALID_STATUSES = {"pendiente", "en_progreso", "por_revisar", "completado", "atrasado"}


class JobReject(BaseModel):
    note: str


class JobCreate(BaseModel):
    title: str
    description: str | None = None
    worker_id: uuid.UUID | None = None
    due_date: date | None = None


class JobUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    worker_id: uuid.UUID | None = None
    due_date: date | None = None


@router.get("")
async def list_jobs(
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    snap = await insights.load_snapshot(session, company_id)

    q = (
        select(Job, Worker, Branch)
        .outerjoin(Worker, Job.worker_id == Worker.id)
        .outerjoin(Branch, Job.branch_id == Branch.id)
        .where(Job.company_id == company_id)
        .order_by(Job.updated_at.desc())
    )
    if status and status in VALID_STATUSES:
        q = q.where(Job.status == status)

    rows = await session.execute(q)
    jobs = []
    for job, worker, branch in rows.tuples():
        photos = snap.photos_by_job.get(job.id, [])
        jobs.append({
            **insights.job_card(snap, job),
            "description": job.description,
            "worker_id": str(job.worker_id) if job.worker_id else None,
            "worker_name": worker.name if worker else None,
            "worker_phone": worker.phone_number if worker else None,
            "branch_id": str(job.branch_id) if job.branch_id else None,
            "branch_name": branch.name if branch else None,
            "approved_at": job.approved_at.isoformat() if job.approved_at else None,
            "closed_at": c.isoformat() if (c := insights.job_closed_at(job)) else None,
            "review_note": job.review_note,
            "photos": [
                {"id": str(p.id), "url": p.media_url, "received_at": p.received_at.isoformat(),
                 "caption": p.text_content}
                for p in photos if p.media_url
            ][-4:],
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat(),
        })
    return {"jobs": jobs, "date": snap.today.isoformat()}


@router.post("", status_code=201)
async def create_job(
    body: JobCreate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)

    branch_id: uuid.UUID | None = None
    if body.worker_id:
        result = await session.execute(select(Worker).where(Worker.id == body.worker_id))
        worker = result.scalar_one_or_none()
        if worker:
            branch_id = worker.branch_id

    job = Job(
        company_id=company_id,
        title=body.title.strip(),
        description=body.description.strip() if body.description else None,
        worker_id=body.worker_id,
        branch_id=branch_id,
        due_date=body.due_date,
        status="pendiente",
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return {"id": str(job.id)}


@router.patch("/{job_id}", status_code=200)
async def update_job(
    job_id: uuid.UUID,
    body: JobUpdate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Job).where(Job.id == job_id, Job.company_id == company_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    updates = body.model_dump(exclude_unset=True)

    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"status inválido: {updates['status']}")

    if "title" in updates and updates["title"]:
        job.title = updates["title"].strip()
    if "description" in updates:
        job.description = updates["description"].strip() if updates["description"] else None
    if "status" in updates:
        _set_status(job, updates["status"])
    if "due_date" in updates:
        job.due_date = updates["due_date"]
    if "worker_id" in updates and updates["worker_id"]:
        job.worker_id = updates["worker_id"]
        res2 = await session.execute(select(Worker).where(Worker.id == updates["worker_id"]))
        w = res2.scalar_one_or_none()
        if w:
            job.branch_id = w.branch_id

    await session.commit()
    return {"ok": True}


@router.delete("/{job_id}", status_code=200)
async def delete_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Job).where(Job.id == job_id, Job.company_id == company_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await session.delete(job)
    await session.commit()
    return {"ok": True}


def _set_status(job: Job, status: str) -> None:
    now = datetime.now(tz=timezone.utc)
    if status == "completado":
        job.approved_at = job.approved_at or now
        job.completed_at = job.completed_at or now
    else:
        job.approved_at = None
    if status == "por_revisar":
        job.completed_at = job.completed_at or now
    elif status in ("pendiente", "en_progreso", "atrasado"):
        job.completed_at = None
    job.status = status


async def _get_job(session: AsyncSession, job_id: uuid.UUID) -> Job:
    company_id = uuid.UUID(settings.company_id)
    job = (await session.execute(
        select(Job).where(Job.id == job_id, Job.company_id == company_id)
    )).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def _job_worker(session: AsyncSession, job: Job) -> Worker | None:
    if not job.worker_id:
        return None
    return (await session.execute(select(Worker).where(Worker.id == job.worker_id))).scalar_one_or_none()


@router.post("/{job_id}/approve", status_code=200)
async def approve_job(job_id: uuid.UUID, session: AsyncSession = Depends(get_db)) -> dict:
    """El dueño vio la evidencia y da por terminada la tarea."""
    job = await _get_job(session, job_id)
    _set_status(job, "completado")
    job.review_note = None
    await session.commit()

    worker = await _job_worker(session, job)
    if worker:
        try:
            await whatsapp.send_text_message(
                worker.phone_number,
                f"✅ Tu jefe aprobó *{job.title}*. ¡Buen trabajo, {worker.name.split()[0]}!",
            )
        except Exception as e:  # fuera de la ventana de 24 h no llega; no es crítico
            logger.info("approve %s: no se pudo avisar al trabajador: %s", job.id, e)
    return {"ok": True}


@router.post("/{job_id}/reject", status_code=200)
async def reject_job(job_id: uuid.UUID, body: JobReject, session: AsyncSession = Depends(get_db)) -> dict:
    """La evidencia no convence: la tarea regresa a 'en progreso' con un comentario."""
    job = await _get_job(session, job_id)
    note = body.note.strip()
    if not note:
        raise HTTPException(status_code=422, detail="Escribe qué falta")
    _set_status(job, "en_progreso")
    job.review_note = note
    await session.commit()

    worker = await _job_worker(session, job)
    notified = False
    if worker:
        jid = str(job.id)
        try:
            await whatsapp.send_interactive_buttons(
                worker.phone_number,
                f"🔁 Tu jefe revisó *{job.title}* y pide:\n\n_{note}_\n\n"
                "Cuando quede, aprieta *Ya terminé* y manda foto.",
                [
                    {"type": "reply", "reply": {"id": f"completado::{jid}", "title": "✅ Ya terminé"}},
                    {"type": "reply", "reply": {"id": f"atrasado::{jid}", "title": "🚫 Tengo un problema"}},
                ],
            )
            notified = True
        except Exception as e:
            logger.info("reject %s: no se pudo avisar al trabajador: %s", job.id, e)
    return {"ok": True, "notified": notified}


@router.post("/{job_id}/remind", status_code=200)
async def remind_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    job = await _get_job(session, job_id)
    worker = await _job_worker(session, job)
    if not worker:
        raise HTTPException(status_code=400, detail="La tarea no tiene trabajador asignado")
    try:
        await notify.job_progress(session, job.company_id, job, worker, local_today())
    except notify.NoWindow as e:
        raise HTTPException(
            status_code=409,
            detail="No ha escrito en 24 h y WhatsApp no deja mandarle mensaje. Escríbele desde tu celular.",
        ) from e
    except Exception as e:
        await session.commit()
        raise HTTPException(
            status_code=502,
            detail="WhatsApp no dejó mandar el mensaje. Escríbele desde tu celular.",
        ) from e
    await session.commit()
    return {"ok": True}
