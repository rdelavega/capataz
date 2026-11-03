import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.branch import Branch
from app.models.event import Event
from app.models.worker import Worker
from app.services import insights
from app.timeutil import greeting, local_date, local_today

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ─── /today: todo lo que necesita el panel en una sola llamada ────────────────

@router.get("/today")
async def get_today(session: AsyncSession = Depends(get_db)) -> dict:
    company_id = uuid.UUID(settings.company_id)
    s = await insights.load_snapshot(session, company_id)

    workers = {w.id: w for w in s.workers}
    jobs = {j.id: j for j in s.jobs}
    feed = []
    for e in s.events_today[:8]:
        w = workers.get(e.worker_id)
        job = jobs.get(e.job_id) if e.job_id else None
        feed.append({
            "id": str(e.id), "type": e.event_type, "received_at": e.received_at.isoformat(),
            "worker_id": str(e.worker_id) if e.worker_id else None,
            "worker_name": w.name if w else None,
            "branch_name": s.branches[w.branch_id].name if w and w.branch_id in s.branches else None,
            "text": e.transcription or e.text_content, "media_url": e.media_url,
            "job_title": job.title if job else None,
            "job_status": job.status if job else None,
        })

    return {
        "date": s.today.isoformat(),
        "now": s.now.isoformat(),
        "greeting": greeting(s.now),
        "attention": insights.attention_items(s),
        "metrics": insights.metrics(s),
        "branches": insights.branch_stats(s),
        "feed": feed,
    }


# ─── /events ──────────────────────────────────────────────────────────────────

@router.get("/events")
async def get_events(
    work_date: Optional[str] = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    query_date = date.fromisoformat(work_date) if work_date else local_today()

    rows = await session.execute(
        select(Event, Worker, Branch)
        .outerjoin(Worker, Event.worker_id == Worker.id)
        .outerjoin(Branch, Worker.branch_id == Branch.id)
        .where(
            Event.company_id == company_id,
            local_date(Event.received_at) == query_date,
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
    """Equipo completo con su estado de hoy y asistencia de 30 días."""
    company_id = uuid.UUID(settings.company_id)
    s = await insights.load_snapshot(session, company_id)
    rows = [insights.worker_row(s, w) for w in s.workers]

    inactive = (await session.execute(
        select(Worker, Branch)
        .outerjoin(Branch, Worker.branch_id == Branch.id)
        .where(Worker.company_id == company_id, Worker.active.is_(False))
        .order_by(Worker.name)
    )).tuples()
    for w, b in inactive:
        rows.append({
            "id": str(w.id), "name": w.name, "phone_number": w.phone_number, "title": w.title,
            "branch_id": str(w.branch_id) if w.branch_id else None,
            "branch_name": b.name if b else None, "active": False,
            "crew_id": None, "crew_name": None, "is_lead": False,
            "today_status": None, "checkin_at": None, "last_event": None,
            "active_jobs": 0, "overdue_jobs": 0, "attendance_30d": [],
            "attendance_pct": None, "late_week": 0,
        })

    rows.sort(key=lambda r: ((r["branch_name"] or "~"), r["name"]))
    return {"workers": rows, "date": s.today.isoformat()}
