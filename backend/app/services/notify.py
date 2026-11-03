"""
Mensajes que el bot manda por iniciativa propia. Cada envío queda en
`notifications`, así el dashboard puede decir "el bot le preguntó a las 8:30".

Orden de preferencia para hablarle a un trabajador:
1. Si escribió en las últimas 24 h (ventana de servicio abierta): mensaje
   normal con botones. No necesita plantilla y cae en los 1,000 mensajes de
   servicio gratis al mes. Es el caso común: casi todos mandan "presente".
2. Si no, y hay plantilla configurada: la plantilla (se cobra como utilidad).
3. Si no hay ninguna de las dos: NoWindow, y no se manda nada.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.event import Event
from app.models.job import Job
from app.models.notification import Notification
from app.models.user import User
from app.models.worker import Worker
from app.services import whatsapp
from app.services.insights import Snapshot, job_is_overdue
from app.timeutil import fmt_dia

logger = logging.getLogger(__name__)


# Margen para no mandar justo cuando la ventana de 24 h se está cerrando.
SERVICE_WINDOW = timedelta(hours=23, minutes=30)


class NoWindow(Exception):
    """El trabajador no ha escrito en 24 h y no hay plantilla: WhatsApp no lo entregaría."""


async def window_open(session: AsyncSession, worker_id: uuid.UUID) -> bool:
    """¿El trabajador escribió en las últimas ~24 h? (ventana de servicio de Meta)."""
    last = (await session.execute(
        select(func.max(Event.received_at)).where(Event.worker_id == worker_id)
    )).scalar_one_or_none()
    return last is not None and datetime.now(tz=timezone.utc) - last < SERVICE_WINDOW


def _first_name(name: str) -> str:
    return name.split()[0]


async def _log(session: AsyncSession, company_id: uuid.UUID, kind: str, *, worker_id=None,
               user_id=None, job_id=None, error: Exception | None = None) -> None:
    session.add(Notification(
        company_id=company_id, kind=kind, worker_id=worker_id, user_id=user_id, job_id=job_id,
        ok=error is None, error=str(error)[:500] if error else None,
    ))
    await session.flush()


async def checkin_reminder(session: AsyncSession, company_id: uuid.UUID, worker: Worker) -> None:
    nombre = _first_name(worker.name)
    in_window = await window_open(session, worker.id)
    if not in_window and not settings.wa_template_checkin_reminder:
        raise NoWindow(worker.name)
    try:
        if in_window:
            await whatsapp.send_interactive_buttons(
                worker.phone_number,
                f"¡Hola {nombre}! 👋 Aún no tenemos tu registro de hoy.",
                [
                    {"type": "reply", "reply": {"id": "checkin", "title": "✅ Ya llegué"}},
                    {"type": "reply", "reply": {"id": "ausente", "title": "Hoy no voy"}},
                ],
            )
        else:
            await whatsapp.send_template(
                worker.phone_number, settings.wa_template_checkin_reminder, [nombre],
                quick_reply_payloads=["checkin", "ausente"],
            )
    except Exception as e:
        await _log(session, company_id, "checkin_reminder", worker_id=worker.id, error=e)
        raise
    await _log(session, company_id, "checkin_reminder", worker_id=worker.id)


def _vence(job: Job, today) -> str:
    if job.due_date is None:
        return "sin fecha"
    if job.due_date < today:
        return f"venció {fmt_dia(job.due_date, today)}"
    return fmt_dia(job.due_date, today)


async def job_progress(session: AsyncSession, company_id: uuid.UUID, job: Job, worker: Worker,
                       today) -> None:
    nombre = _first_name(worker.name)
    jid = str(job.id)
    payloads = [f"completado::{jid}", f"en_progreso::{jid}", f"atrasado::{jid}"]
    in_window = await window_open(session, worker.id)
    if not in_window and not settings.wa_template_job_progress:
        raise NoWindow(worker.name)
    try:
        if not in_window:
            await whatsapp.send_template(
                worker.phone_number, settings.wa_template_job_progress,
                [nombre, job.title, _vence(job, today)], quick_reply_payloads=payloads,
            )
        else:
            titles = ["✅ Ya terminé", "🔄 Sigo en eso", "🚫 Tengo un problema"]
            await whatsapp.send_interactive_buttons(
                worker.phone_number,
                f"Hola {nombre}, ¿cómo va la tarea?\n\n📋 *{job.title}*\nVence: {_vence(job, today)}",
                [{"type": "reply", "reply": {"id": p, "title": t}} for p, t in zip(payloads, titles)],
            )
    except Exception as e:
        await _log(session, company_id, "job_progress", worker_id=worker.id, job_id=job.id, error=e)
        raise
    await _log(session, company_id, "job_progress", worker_id=worker.id, job_id=job.id)


def summary_params(s: Snapshot) -> list[str]:
    """Parámetros de la plantilla de resumen diario (ver docs/plantillas_whatsapp.md)."""
    present = [w for w in s.workers
               if (r := s.attendance.get(w.id, {}).get(s.today)) and r.status in ("presente", "tarde")]
    missing = [w.name for w in s.workers if w not in present and s.worker_start(w) <= s.today]
    done_today = [j for j in s.jobs if j.status in ("por_revisar", "completado")
                  and j.completed_at and j.completed_at.astimezone(s.now.tzinfo).date() == s.today]
    review = [j for j in s.jobs if j.status == "por_revisar"]
    overdue = [f"{j.title} ({s.who(j)})" for j in s.jobs if job_is_overdue(j, s.today)]

    def cap(items: list[str], n: int = 3) -> str:
        if not items:
            return "ninguna"
        extra = f" y {len(items) - n} más" if len(items) > n else ""
        return ", ".join(items[:n]) + extra

    return [
        fmt_dia(s.today, s.today).capitalize() + " " + s.today.strftime("%d/%m"),
        str(len(present)),
        str(len(present) + len(missing)),
        cap(missing) if missing else "nadie",
        str(len(done_today)),
        str(len(review)),
        cap(overdue),
    ]


async def daily_summary(session: AsyncSession, company_id: uuid.UUID, user: User, s: Snapshot) -> None:
    if not user.phone_number:
        return
    try:
        await whatsapp.send_template(user.phone_number, settings.wa_template_daily_summary, summary_params(s))
    except Exception as e:
        await _log(session, company_id, "daily_summary", user_id=user.id, error=e)
        raise
    await _log(session, company_id, "daily_summary", user_id=user.id)
