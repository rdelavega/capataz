import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import geo
from app.config import settings
from app.db import get_db
from app.models.attendance import AttendanceDaily
from app.models.branch import Branch
from app.models.company import Company
from app.models.event import Event
from app.models.job import Job
from app.models.worker import Worker
from app.services import activity, insights
from app.services import photos as photo_svc
from app.sites import site_or_default
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


# ─── /day: bitácora del día por persona ───────────────────────────────────────

@router.get("/day")
async def get_day(
    work_date: Optional[str] = Query(default=None, alias="date"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """
    Lo que hizo cada quien en un día, por obra: llegada, fotos, reportes y lo
    que pasó con cada trabajo. Sin acuses sueltos ni botones: para eso está
    /events (todos los mensajes).
    """
    company_id = uuid.UUID(settings.company_id)
    day = date.fromisoformat(work_date) if work_date else local_today()

    branches = {b.id: b for b in (await session.execute(
        select(Branch).where(Branch.company_id == company_id).order_by(Branch.name)
    )).scalars()}
    events = list((await session.execute(
        select(Event).where(
            Event.company_id == company_id, local_date(Event.received_at) == day,
            Event.worker_id.is_not(None),
        ).order_by(Event.received_at)
    )).scalars())
    with_events = {e.worker_id for e in events}
    workers = [w for w in (await session.execute(
        select(Worker).where(Worker.company_id == company_id).order_by(Worker.name)
    )).scalars() if w.active or w.id in with_events]
    attendance = {a.worker_id: a for a in (await session.execute(
        select(AttendanceDaily).where(AttendanceDaily.company_id == company_id, AttendanceDaily.work_date == day)
    )).scalars()}
    job_ids = {e.job_id for e in events if e.job_id}
    jobs = {j.id: j for j in (await session.execute(select(Job).where(Job.id.in_(job_ids)))).scalars()} if job_ids else {}
    originals = await photo_svc.load_originals(session, events)

    company = await session.get(Company, company_id)
    site = site_or_default(company.site_label if company else None)

    by_worker: dict[uuid.UUID, list[Event]] = {}
    for e in events:
        by_worker.setdefault(e.worker_id, []).append(e)

    def card(w: Worker) -> dict:
        rec = attendance.get(w.id)
        photos, reports, job_activity = [], [], {}
        for e in by_worker.get(w.id, []):
            c = activity.classify(e)
            job = jobs.get(e.job_id) if e.job_id else None
            if c["kind"] == "photo" and e.media_url:
                photos.append(photo_svc.photo_dict(e, originals, job_title=job.title if job else None))
            if job and c["kind"] in ("photo", "enterado", "termino", "en_progreso", "problema", "problema_detalle"):
                entry = job_activity.setdefault(job.id, {"job_id": str(job.id), "title": job.title,
                                                         "status": job.status, "activity": []})
                entry["activity"].append({
                    "kind": c["kind"], "at": e.received_at.isoformat(),
                    "label": "Foto de avance" if c["kind"] == "photo" else c["label"],
                    "text": c["text"] if c["kind"] == "problema_detalle" else None,
                })
            elif c["kind"] == "report":
                reports.append({"id": str(e.id), "type": e.event_type, "received_at": e.received_at.isoformat(),
                                "text": c["text"], "media_url": e.media_url})
        return {
            "id": str(w.id), "name": w.name, "title": w.title, "active": w.active, "photo_url": w.photo_url,
            "attendance": {
                "status": rec.status, "checkin_at": rec.checkin_at.isoformat() if rec.checkin_at else None,
                "location": insights.location_info(branches, rec, site),
            } if rec else None,
            "photos": photos, "reports": reports, "jobs": list(job_activity.values()),
            "messages": len(by_worker.get(w.id, [])),
        }

    groups: dict[uuid.UUID | None, list[dict]] = {}
    for w in workers:
        groups.setdefault(w.branch_id if w.branch_id in branches else None, []).append(card(w))
    out = []
    for bid in [*branches, None]:
        cards = groups.get(bid)
        if not cards:
            continue
        # Primero quien hizo algo; al final quien no mandó nada
        cards.sort(key=lambda c: (c["messages"] == 0 and c["attendance"] is None, c["name"]))
        out.append({"id": str(bid) if bid else None, "name": branches[bid].name if bid else f"Sin {site}",
                    "workers": cards})
    return {"date": day.isoformat(), "branches": out, "messages": len(events)}


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

    rows = list(rows.tuples())
    branches = (await session.execute(select(Branch).where(Branch.company_id == company_id))).scalars().all()
    originals = await photo_svc.load_originals(session, [e for e, _, _ in rows])
    job_ids = {e.job_id for e, _, _ in rows if e.job_id}
    job_titles = dict((await session.execute(
        select(Job.id, Job.title).where(Job.id.in_(job_ids))
    )).tuples().all()) if job_ids else {}

    def location_label(event: Event, worker: Worker | None) -> str | None:
        """'En Obra Norte' / 'A 2.3 km de Obra Norte'. Las coordenadas no salen del servidor."""
        if event.event_type != "location" and event.latitude is None:
            return None
        if event.latitude is None or event.longitude is None:
            return "Ubicación (ya borrada)"
        check = geo.check_location(event.latitude, event.longitude, branches, worker.branch_id if worker else None)
        if check.status == "en_sitio":
            return f"En {check.branch_name}"
        if check.status == "lejos":
            return f"A {geo.fmt_distance(check.distance_m)} de {check.branch_name}"
        return "Ubicación recibida"

    events = []
    for event, worker, branch in rows:
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
            "location_label": location_label(event, worker),
            "job_title": job_titles.get(event.job_id) if event.job_id else None,
            "duplicate_of": originals.get(event.duplicate_of_id) if event.duplicate_of_id else None,
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
            "photo_url": w.photo_url,
            "branch_id": str(w.branch_id) if w.branch_id else None,
            "branch_name": b.name if b else None, "active": False,
            "crew_id": None, "crew_name": None, "is_lead": False,
            "today_status": None, "checkin_at": None, "location": None, "last_event": None,
            "active_jobs": 0, "overdue_jobs": 0, "attendance_30d": [],
            "attendance_pct": None, "late_week": 0,
        })

    rows.sort(key=lambda r: ((r["branch_name"] or "~"), r["name"]))
    return {"workers": rows, "date": s.today.isoformat()}
