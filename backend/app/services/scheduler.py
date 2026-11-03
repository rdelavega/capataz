"""
Envíos programados: el bot persigue a la gente para que el dueño no tenga que.

- checkin_reminder (08:30): a quien no ha mandado "presente".
- job_progress (15:00): tareas que vencen hoy o ya vencieron y no tienen foto de hoy.
- daily_summary (18:00): resumen del día al WhatsApp del dueño.

A los trabajadores se les escribe sin plantilla si su ventana de 24 h está
abierta (ver notify.py); la plantilla solo hace falta para quien no ha
escrito. El resumen al dueño siempre necesita plantilla.

Cada envío corre una vez al día: `scheduled_runs` (kind, run_date) es el
candado, así que reinicios o varias instancias no duplican mensajes. Si la app
estuvo caída a la hora exacta, corre en cuanto vuelve, dentro de una ventana de
2 horas; después de eso se salta el día.
"""
import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import AsyncSessionLocal
from app.models.notification import ScheduledRun
from app.models.user import User
from app.services import insights, notify
from app.timeutil import TZ, is_rest_day, local_now, parse_hhmm, to_local

logger = logging.getLogger(__name__)

TICK_SECONDS = 60
CATCH_UP_WINDOW = timedelta(hours=2)


async def _claim(session: AsyncSession, kind: str, now: datetime) -> bool:
    """True si esta instancia ganó el derecho de correr `kind` hoy."""
    result = await session.execute(
        pg_insert(ScheduledRun).values(kind=kind, run_date=now.date())
        .on_conflict_do_nothing().returning(ScheduledRun.kind)
    )
    await session.commit()
    return result.scalar_one_or_none() is not None


async def run_checkin_reminders(session: AsyncSession, company_id: uuid.UUID) -> int:
    s = await insights.load_snapshot(session, company_id)
    sent = 0
    for w in s.workers:
        if s.worker_start(w) > s.today or s.attendance.get(w.id, {}).get(s.today):
            continue
        try:
            await notify.checkin_reminder(session, company_id, w)
            sent += 1
        except notify.NoWindow:
            continue
        except Exception as e:
            logger.warning("checkin_reminder a %s falló: %s", w.name, e)
    await session.commit()
    return sent


async def run_job_progress(session: AsyncSession, company_id: uuid.UUID) -> int:
    s = await insights.load_snapshot(session, company_id)
    workers = {w.id: w for w in s.workers}
    sent = 0
    for j in s.jobs:
        if j.status not in ("pendiente", "en_progreso", "atrasado") or j.worker_id not in workers:
            continue
        if j.due_date is None or j.due_date > s.today:
            continue
        if any(to_local(p.received_at).date() == s.today for p in s.photos_by_job.get(j.id, [])):
            continue
        try:
            await notify.job_progress(session, company_id, j, workers[j.worker_id], s.today)
            sent += 1
        except notify.NoWindow:
            continue
        except Exception as e:
            logger.warning("job_progress de %s falló: %s", j.title, e)
    await session.commit()
    return sent


async def run_daily_summary(session: AsyncSession, company_id: uuid.UUID) -> int:
    s = await insights.load_snapshot(session, company_id)
    users = (await session.execute(
        select(User).where(User.company_id == company_id, User.phone_number.is_not(None))
    )).scalars().all()
    sent = 0
    for u in users:
        try:
            await notify.daily_summary(session, company_id, u, s)
            sent += 1
        except Exception as e:
            logger.warning("daily_summary a %s falló: %s", u.email, e)
    await session.commit()
    return sent


Job = Callable[[AsyncSession, uuid.UUID], Awaitable[int]]


def _jobs() -> list[tuple[str, str, bool, Job]]:
    """(kind, hora, ¿activo?, función)."""
    return [
        # A trabajadores: sin plantilla igual corre para quien tenga la ventana abierta.
        ("checkin_reminder", settings.checkin_reminder_time, settings.proactive_enabled, run_checkin_reminders),
        ("job_progress", settings.job_progress_time, settings.proactive_enabled, run_job_progress),
        # Al dueño: él casi nunca le escribe al bot, así que sin plantilla no hay resumen.
        ("daily_summary", settings.daily_summary_time, bool(settings.wa_template_daily_summary), run_daily_summary),
    ]


def due_jobs(now: datetime) -> list[tuple[str, Job]]:
    out = []
    for kind, hhmm, enabled, fn in _jobs():
        if not enabled:
            continue
        if is_rest_day(now.date()):
            continue
        target = datetime.combine(now.date(), parse_hhmm(hhmm), tzinfo=TZ)
        if target <= now <= target + CATCH_UP_WINDOW:
            out.append((kind, fn))
    return out


async def tick() -> None:
    now = local_now()
    company_id = uuid.UUID(settings.company_id)
    for kind, fn in due_jobs(now):
        async with AsyncSessionLocal() as session:
            if not await _claim(session, kind, now):
                continue
            sent = await fn(session, company_id)
            logger.info("scheduler: %s enviado a %d", kind, sent)


async def run_forever() -> None:
    logger.info("scheduler: iniciado")
    while True:
        try:
            await tick()
        except Exception:
            logger.exception("scheduler: error en tick")
        await asyncio.sleep(TICK_SECONDS)
