"""
Procesa un evento ya insertado en DB: identifica al worker, clasifica el tipo
de mensaje y dispara acciones secundarias (attendance, media, transcripción,
tareas).
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import settings
from app.db import AsyncSessionLocal
from app.models.attendance import AttendanceDaily
from app.models.event import Event
from app.models.job import Job
from app.models.worker import Worker
from app.phone import phone_variants
from app.services import storage, transcription, whatsapp
from app.timeutil import greeting, is_late, local_today

logger = logging.getLogger(__name__)

UNREGISTERED_REPLY = (
    "Hola 👋 Este número es de Capataz, el sistema de registro de tu empresa. "
    "Todavía no estás dado de alta: pídele a tu jefe que te registre."
)

CHECKIN_KEYWORDS = {
    "presente", "buenos días", "buen día", "buenos dias", "buen dia",
    "ya llegué", "ya llegue", "checkin", "check in",
}

# Botones que mandan los mensajes del bot: "<estado>::<job_id>" o una acción simple.
JOB_BUTTON_STATUSES = {"completado", "en_progreso", "atrasado"}
BUTTON_CHECKIN = "checkin"
BUTTON_ABSENT = "ausente"

# Una foto que llega dentro de esta ventana después de "Terminé" es la evidencia de esa tarea.
REVIEW_PHOTO_WINDOW = timedelta(hours=6)
OPEN_STATUSES = ("pendiente", "en_progreso", "atrasado")


def _is_checkin(text: str) -> bool:
    text_lower = text.lower().strip()
    return any(kw in text_lower for kw in CHECKIN_KEYWORDS)


def _extract_message(raw: dict, wa_msg_id: str) -> dict | None:
    """Busca en el payload el mensaje de este evento (un POST puede traer varios)."""
    for entry in raw.get("entry", []):
        for change in entry.get("changes", []):
            for msg in change.get("value", {}).get("messages", []):
                if msg.get("id") == wa_msg_id:
                    return msg
    return None


def _button_payload(msg: dict) -> str | None:
    """Payload de un botón: interactive (mensaje libre) o button (plantilla)."""
    if msg.get("type") == "interactive":
        interactive = msg.get("interactive", {})
        if interactive.get("type") == "button_reply":
            return interactive.get("button_reply", {}).get("id")
    if msg.get("type") == "button":
        return msg.get("button", {}).get("payload")
    return None


def _ack_reply(event_type: str, nombre: str, has_checkin: bool) -> str | None:
    """Acuse de recibo para que el trabajador sepa que su mensaje sí llegó."""
    reply = {
        "photo":    f"📸 Foto recibida, {nombre}. Gracias.",
        "audio":    f"🎙️ Audio recibido, {nombre}. Ya quedó anotado.",
        "location": f"📍 Ubicación recibida, {nombre}. Gracias.",
        "text":     f"👍 Recibido, {nombre}. Ya quedó anotado.",
        "unknown":  f"👍 Recibido, {nombre}.",
    }.get(event_type)
    if reply and not has_checkin:
        reply += " Si ya llegaste, manda *presente*."
    return reply


async def _safe_send(event_id: uuid.UUID, phone_number: str, body: str) -> None:
    try:
        await whatsapp.send_text_message(phone_number, body)
    except Exception as e:
        logger.error("event %s: failed to send reply: %s", event_id, e)


async def _handle_job_button(session, worker: Worker, nombre: str, payload: str) -> str | None:
    """Actualiza la tarea según el botón. Devuelve la respuesta para el trabajador."""
    status, _, job_id_str = payload.partition("::")
    if status not in JOB_BUTTON_STATUSES:
        return None
    try:
        job_uuid = uuid.UUID(job_id_str)
    except ValueError:
        logger.warning("invalid job_id in button payload: %s", payload)
        return None

    job = (await session.execute(
        select(Job).where(Job.id == job_uuid, Job.worker_id == worker.id)
    )).scalar_one_or_none()
    if job is None:
        logger.warning("job %s not found for worker %s", job_id_str, worker.id)
        return None

    if job.status == "completado":
        return f"👍 *{job.title}* ya estaba aprobada, {nombre}. ¡Gracias!"

    if status == "completado":
        # "Terminé" no cierra la tarea: queda por revisar hasta que el dueño ve la foto.
        job.status = "por_revisar"
        job.completed_at = datetime.now(tz=timezone.utc)
        job.review_note = None
        return (
            f"✅ Anotado, {nombre}. Mándame una *foto de cómo quedó* "
            f"*{job.title}* para que tu jefe la apruebe."
        )
    if status == "en_progreso":
        job.status = "en_progreso"
        return f"🔄 Entendido, {nombre}. Cuando avances, manda foto."
    job.status = "atrasado"
    return f"🚫 Anotado, {nombre}. Ya le avisé a tu jefe que tienes un problema con *{job.title}*."


async def _link_photo_to_job(session, worker: Worker, now: datetime) -> Job | None:
    """
    Decide a qué tarea pertenece una foto:
    1. La tarea que el trabajador acaba de marcar como terminada (por_revisar reciente).
    2. Si solo tiene una tarea abierta, esa (evidencia de avance).
    """
    jobs = (await session.execute(
        select(Job).where(
            Job.worker_id == worker.id,
            Job.status.in_(("por_revisar", *OPEN_STATUSES)),
        )
    )).scalars().all()

    in_review = [
        j for j in jobs
        if j.status == "por_revisar" and j.completed_at and now - j.completed_at <= REVIEW_PHOTO_WINDOW
    ]
    if in_review:
        return max(in_review, key=lambda j: j.completed_at)

    open_jobs = [j for j in jobs if j.status in OPEN_STATUSES]
    if len(open_jobs) == 1:
        job = open_jobs[0]
        if job.status == "pendiente":
            job.status = "en_progreso"
        return job
    return None


async def process_event(event_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as session:
        await _process(event_id, session)


async def _process(event_id: uuid.UUID, session) -> None:
    event = await session.get(Event, event_id)
    if event is None:
        return

    msg = _extract_message(event.raw_payload, event.whatsapp_message_id)
    if msg is None:
        logger.info("event %s: no message in payload (status update?)", event_id)
        return

    phone_number = msg.get("from", "")
    if not phone_number.startswith("+"):
        phone_number = f"+{phone_number}"

    # Buscar worker por phone_number dentro de la company
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Worker).where(
            Worker.phone_number.in_(phone_variants(phone_number)),
            Worker.company_id == company_id,
            Worker.active.is_(True),
        )
    )
    worker = result.scalar_one_or_none()
    if worker is None:
        logger.warning("event %s: worker not found for phone %s", event_id, phone_number)
        await _safe_send(event_id, phone_number, UNREGISTERED_REPLY)
        return

    nombre = worker.name.split()[0]
    now = datetime.now(tz=timezone.utc)

    # Clasificar tipo de mensaje
    msg_type = msg.get("type", "unknown")
    event_type = "unknown"
    text_content: str | None = None
    media_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    transcription_text: str | None = None
    reply: str | None = None
    already_replied = False
    marked_absent = False

    if msg_type == "text":
        text_content = msg.get("text", {}).get("body", "")
        event_type = "checkin" if _is_checkin(text_content) else "text"

    elif msg_type == "image":
        event_type = "photo"
        text_content = msg.get("image", {}).get("caption")
        media_id = msg.get("image", {}).get("id")
        if media_id:
            try:
                media_bytes = await whatsapp.download_media(media_id)
                key = f"media/{company_id}/{event_id}.jpg"
                media_url = storage.upload_to_r2(media_bytes, key, "image/jpeg")
            except Exception as e:
                logger.error("event %s: failed to download/upload image: %s", event_id, e)

    elif msg_type == "audio":
        event_type = "audio"
        media_id = msg.get("audio", {}).get("id")
        media_bytes: bytes | None = None
        if media_id:
            try:
                media_bytes = await whatsapp.download_media(media_id)
            except Exception as e:
                logger.error("event %s: failed to download audio: %s", event_id, e)
        if media_bytes:
            # Subida y transcripción independientes: si R2 falla, igual transcribimos
            try:
                key = f"media/{company_id}/{event_id}.ogg"
                media_url = storage.upload_to_r2(media_bytes, key, "audio/ogg")
            except Exception as e:
                logger.error("event %s: failed to upload audio: %s", event_id, e)
            transcription_text = await transcription.transcribe(media_bytes)
            # Si la transcripción suena a check-in, reclasificar
            if transcription_text and _is_checkin(transcription_text):
                event_type = "checkin"
                text_content = transcription_text

    elif msg_type in ("interactive", "button"):
        payload = _button_payload(msg) or ""
        text_content = msg.get("button", {}).get("text") or msg.get("interactive", {}).get(
            "button_reply", {}).get("title")
        event_type = "text"
        if payload == BUTTON_CHECKIN:
            event_type = "checkin"
        elif payload == BUTTON_ABSENT:
            marked_absent = True
        else:
            job_reply = await _handle_job_button(session, worker, nombre, payload)
            if job_reply:
                event.job_id = uuid.UUID(payload.partition("::")[2])
                reply = job_reply
                already_replied = True

    elif msg_type == "location":
        event_type = "location"
        loc = msg.get("location", {})
        latitude = loc.get("latitude")
        longitude = loc.get("longitude")

    # Actualizar el evento
    event.worker_id = worker.id
    event.event_type = event_type
    event.text_content = text_content
    event.media_url = media_url
    event.transcription = transcription_text
    event.latitude = latitude
    event.longitude = longitude

    today = local_today()
    existing = await session.execute(
        select(AttendanceDaily).where(
            AttendanceDaily.worker_id == worker.id,
            AttendanceDaily.work_date == today,
        )
    )
    attendance = existing.scalar_one_or_none()

    if event_type == "checkin":
        # Check-in → upsert en attendance_daily + respuesta al trabajador
        status = "tarde" if is_late(now) else "presente"
        if attendance is None:
            attendance = AttendanceDaily(
                company_id=company_id,
                worker_id=worker.id,
                work_date=today,
                status=status,
                checkin_at=now,
                event_id=event.id,
            )
            session.add(attendance)
            reply = f"✅ ¡Presente! {greeting()}, {nombre}. Tu registro quedó guardado."
        else:
            if attendance.status == "ausente":
                attendance.status = status
            attendance.checkin_at = attendance.checkin_at or now
            reply = f"👍 Ya tenías registro de hoy, {nombre}. ¡Que te vaya bien!"

    elif marked_absent:
        if attendance is None:
            session.add(AttendanceDaily(
                company_id=company_id, worker_id=worker.id, work_date=today,
                status="ausente", checkin_at=None, event_id=event.id,
            ))
            reply = f"Anotado, {nombre}. Le aviso a tu jefe que hoy no vas."
        else:
            reply = f"👍 Ya tenías registro de hoy, {nombre}."

    elif event_type == "photo":
        job = await _link_photo_to_job(session, worker, now)
        if job is not None:
            event.job_id = job.id
            if job.status == "por_revisar":
                reply = f"📸 Foto recibida para *{job.title}*. Ya le avisé a tu jefe para que la apruebe."
            else:
                reply = f"📸 Foto de avance guardada en *{job.title}*. Gracias, {nombre}."
            if attendance is None:
                reply += " Si ya llegaste, manda *presente*."
        else:
            reply = _ack_reply(event_type, nombre, has_checkin=attendance is not None)

    elif not already_replied:
        reply = _ack_reply(event_type, nombre, has_checkin=attendance is not None)

    await session.commit()
    if reply:
        await _safe_send(event_id, phone_number, reply)
    logger.info("event %s: processed as %s for worker %s", event_id, event_type, worker.name)
