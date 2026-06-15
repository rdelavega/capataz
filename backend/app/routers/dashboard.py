import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import cast, func, select
from sqlalchemy.types import Date as SQLDate
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.db import get_db
from app.models.attendance import AttendanceDaily
from app.models.branch import Branch
from app.models.event import Event
from app.models.job import Job
from app.models.worker import Worker

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _semaforo(total: int, presentes: int, overdue_jobs: int) -> str:
    if overdue_jobs > 0 or (total > 0 and presentes == 0):
        return "rojo"
    if total == 0 or presentes == total:
        return "verde"
    ratio = presentes / total
    return "verde" if ratio == 1.0 else ("amarillo" if ratio >= 0.5 else "rojo")


# ─── /overview ────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview(session: AsyncSession = Depends(get_db)) -> dict:
    company_id = uuid.UUID(settings.company_id)
    today = date.today()

    branches_result = await session.execute(
        select(Branch)
        .where(Branch.company_id == company_id)
        .options(selectinload(Branch.workers))
        .order_by(Branch.name)
    )
    branches = branches_result.scalars().all()

    att_result = await session.execute(
        select(AttendanceDaily).where(
            AttendanceDaily.company_id == company_id,
            AttendanceDaily.work_date == today,
        )
    )
    attendance_by_worker: dict[uuid.UUID, AttendanceDaily] = {
        a.worker_id: a for a in att_result.scalars().all()
    }

    subq = (
        select(Event.worker_id, func.max(Event.received_at).label("max_at"))
        .where(Event.company_id == company_id)
        .group_by(Event.worker_id)
        .subquery()
    )
    last_events_result = await session.execute(
        select(Event).join(
            subq,
            (Event.worker_id == subq.c.worker_id) & (Event.received_at == subq.c.max_at),
        )
    )
    last_event_by_worker: dict[uuid.UUID, Event] = {
        e.worker_id: e for e in last_events_result.scalars().all() if e.worker_id
    }

    jobs_result = await session.execute(
        select(Job).where(
            Job.company_id == company_id,
            Job.status.in_(["pendiente", "en_progreso", "atrasado"]),
        )
    )
    active_jobs_by_worker: dict[uuid.UUID, int] = {}
    overdue_jobs_by_worker: dict[uuid.UUID, int] = {}
    for job in jobs_result.scalars().all():
        if job.worker_id is None:
            continue
        active_jobs_by_worker[job.worker_id] = active_jobs_by_worker.get(job.worker_id, 0) + 1
        if job.status == "atrasado" or (job.due_date and job.due_date < today):
            overdue_jobs_by_worker[job.worker_id] = overdue_jobs_by_worker.get(job.worker_id, 0) + 1

    branch_list = []
    for branch in branches:
        active_workers = [w for w in branch.workers if w.active]
        workers_data = []
        branch_overdue = 0
        branch_presentes = 0

        for worker in active_workers:
            att = attendance_by_worker.get(worker.id)
            last_evt = last_event_by_worker.get(worker.id)
            active = active_jobs_by_worker.get(worker.id, 0)
            overdue = overdue_jobs_by_worker.get(worker.id, 0)
            branch_overdue += overdue
            if att and att.status == "presente":
                branch_presentes += 1

            workers_data.append({
                "id": str(worker.id),
                "name": worker.name,
                "phone_number": worker.phone_number,
                "title": worker.title,
                "branch_name": branch.name,
                "today_status": att.status if att else None,
                "checkin_at": att.checkin_at.isoformat() if att and att.checkin_at else None,
                "last_event": {
                    "type": last_evt.event_type,
                    "received_at": last_evt.received_at.isoformat(),
                } if last_evt else None,
                "active_jobs": active,
                "overdue_jobs": overdue,
            })

        branch_list.append({
            "id": str(branch.id),
            "name": branch.name,
            "workers": workers_data,
            "semaforo": _semaforo(len(active_workers), branch_presentes, branch_overdue),
        })

    return {"branches": branch_list, "date": today.isoformat()}


# ─── /events ──────────────────────────────────────────────────────────────────

@router.get("/events")
async def get_events(
    work_date: Optional[str] = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    query_date = date.fromisoformat(work_date) if work_date else date.today()

    rows = await session.execute(
        select(Event, Worker, Branch)
        .outerjoin(Worker, Event.worker_id == Worker.id)
        .outerjoin(Branch, Worker.branch_id == Branch.id)
        .where(
            Event.company_id == company_id,
            cast(Event.received_at, SQLDate) == query_date,
        )
        .order_by(Event.received_at.desc())
    )

    events = []
    for event, worker, branch in rows.tuples():
        events.append({
            "id": str(event.id),
            "received_at": event.received_at.isoformat(),
            "worker_id": str(event.worker_id) if event.worker_id else None,
            "worker_name": worker.name if worker else None,
            "branch_name": branch.name if branch else None,
            "event_type": event.event_type,
            "text_content": event.text_content,
            "media_url": event.media_url,
            "transcription": event.transcription,
            "latitude": event.latitude,
            "longitude": event.longitude,
        })

    return {"date": query_date.isoformat(), "events": events}


# ─── /workers ─────────────────────────────────────────────────────────────────

@router.get("/workers")
async def get_workers(session: AsyncSession = Depends(get_db)) -> dict:
    company_id = uuid.UUID(settings.company_id)
    today = date.today()

    # Último evento por worker
    subq = (
        select(Event.worker_id, func.max(Event.received_at).label("max_at"))
        .where(Event.company_id == company_id)
        .group_by(Event.worker_id)
        .subquery()
    )
    last_events_result = await session.execute(
        select(Event).join(
            subq,
            (Event.worker_id == subq.c.worker_id) & (Event.received_at == subq.c.max_at),
        )
    )
    last_event_by_worker: dict[uuid.UUID, Event] = {
        e.worker_id: e for e in last_events_result.scalars().all() if e.worker_id
    }

    # Eventos de hoy por worker
    today_counts_result = await session.execute(
        select(Event.worker_id, func.count(Event.id).label("cnt"))
        .where(
            Event.company_id == company_id,
            cast(Event.received_at, SQLDate) == today,
        )
        .group_by(Event.worker_id)
    )
    events_today_by_worker: dict[uuid.UUID, int] = {
        row.worker_id: row.cnt
        for row in today_counts_result
        if row.worker_id
    }

    # Workers con branch
    rows = await session.execute(
        select(Worker, Branch)
        .outerjoin(Branch, Worker.branch_id == Branch.id)
        .where(Worker.company_id == company_id)
        .order_by(Branch.name, Worker.name)
    )

    workers = []
    for worker, branch in rows.tuples():
        last_evt = last_event_by_worker.get(worker.id)
        workers.append({
            "id": str(worker.id),
            "name": worker.name,
            "phone_number": worker.phone_number,
            "title": worker.title,
            "branch_id": str(worker.branch_id) if worker.branch_id else None,
            "branch_name": branch.name if branch else None,
            "active": worker.active,
            "events_today": events_today_by_worker.get(worker.id, 0),
            "last_event": {
                "type": last_evt.event_type,
                "received_at": last_evt.received_at.isoformat(),
            } if last_evt else None,
        })

    return {"workers": workers}
