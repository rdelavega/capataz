"""
Procesa un evento ya insertado en DB: identifica al worker, clasifica el tipo
de mensaje y dispara acciones secundarias (attendance, media, transcripción).
"""
import logging
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.db import AsyncSessionLocal
from app.models.attendance import AttendanceDaily
from app.models.event import Event
from app.models.job import Job
from app.models.worker import Worker
from app.services import storage, transcription, whatsapp

logger = logging.getLogger(__name__)

CHECKIN_KEYWORDS = {
    "presente", "buenos días", "buen día", "buenos dias", "buen dia",
    "ya llegué", "ya llegue", "checkin", "check in",
}


def _is_checkin(text: str) -> bool:
    text_lower = text.lower().strip()
    return any(kw in text_lower for kw in CHECKIN_KEYWORDS)


def _extract_message(raw: dict) -> dict | None:
    """Navega el payload de WhatsApp Cloud API para extraer el primer mensaje."""
    try:
        entry = raw["entry"][0]
        change = entry["changes"][0]["value"]
        messages = change.get("messages")
        if not messages:
            return None
        return messages[0]
    except (KeyError, IndexError):
        return None


async def process_event(event_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as session:
        await _process(event_id, session)


async def _process(event_id: uuid.UUID, session) -> None:
    event = await session.get(Event, event_id)
    if event is None:
        return

    msg = _extract_message(event.raw_payload)
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
            Worker.phone_number == phone_number,
            Worker.company_id == company_id,
            Worker.active.is_(True),
        )
    )
    worker = result.scalar_one_or_none()
    if worker is None:
        logger.warning("event %s: worker not found for phone %s", event_id, phone_number)
        return

    # Clasificar tipo de mensaje
    msg_type = msg.get("type", "unknown")
    event_type = "unknown"
    text_content: str | None = None
    media_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    transcription_text: str | None = None

    if msg_type == "text":
        text_content = msg.get("text", {}).get("body", "")
        event_type = "checkin" if _is_checkin(text_content) else "text"

    elif msg_type == "image":
        event_type = "photo"
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
        if media_id:
            try:
                media_bytes = await whatsapp.download_media(media_id)
                key = f"media/{company_id}/{event_id}.ogg"
                media_url = storage.upload_to_r2(media_bytes, key, "audio/ogg")
                transcription_text = await transcription.transcribe(media_bytes)
                # Si la transcripción suena a check-in, reclasificar
                if transcription_text and _is_checkin(transcription_text):
                    event_type = "checkin"
                    text_content = transcription_text
            except Exception as e:
                logger.error("event %s: failed to process audio: %s", event_id, e)

    elif msg_type == "interactive":
        interactive = msg.get("interactive", {})
        if interactive.get("type") == "button_reply":
            button_id = interactive.get("button_reply", {}).get("id", "")
            parts = button_id.split("::")
            if len(parts) == 2:
                status, job_id_str = parts
                if status in {"pendiente", "en_progreso", "completado", "atrasado"}:
                    try:
                        job_uuid = uuid.UUID(job_id_str)
                        job_result = await session.execute(
                            select(Job).where(
                                Job.id == job_uuid,
                                Job.worker_id == worker.id,
                            )
                        )
                        job = job_result.scalar_one_or_none()
                        if job:
                            job.status = status
                            nombre = worker.name.split()[0]
                            REPLY = {
                                "completado":  f"✅ Tarea marcada como terminada. ¡Buen trabajo, {nombre}!",
                                "en_progreso": f"🔄 Entendido, {nombre}. Sigue adelante.",
                                "atrasado":    f"🚫 Anotado, {nombre}. El jefe ya sabe.",
                            }
                            try:
                                await whatsapp.send_text_message(phone_number, REPLY[status])
                            except Exception as e:
                                logger.error("event %s: failed to send button reply: %s", event_id, e)
                        else:
                            logger.warning("event %s: job %s not found for worker %s", event_id, job_id_str, worker.id)
                    except ValueError:
                        logger.warning("event %s: invalid job_id in button_id: %s", event_id, button_id)
        event_type = "text"

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

    # Check-in → upsert en attendance_daily + respuesta al trabajador
    if event_type == "checkin":
        today = date.today()
        existing = await session.execute(
            select(AttendanceDaily).where(
                AttendanceDaily.worker_id == worker.id,
                AttendanceDaily.work_date == today,
            )
        )
        attendance = existing.scalar_one_or_none()
        if attendance is None:
            attendance = AttendanceDaily(
                company_id=company_id,
                worker_id=worker.id,
                work_date=today,
                status="presente",
                checkin_at=datetime.now(tz=timezone.utc),
                event_id=event.id,
            )
            session.add(attendance)
            reply = f"✅ ¡Presente! Buenos días, {worker.name.split()[0]}. Tu registro quedó guardado."
        else:
            attendance.status = "presente"
            attendance.checkin_at = attendance.checkin_at or datetime.now(tz=timezone.utc)
            reply = f"👍 Ya tenías registro de hoy, {worker.name.split()[0]}. ¡Que te vaya bien!"

        try:
            await whatsapp.send_text_message(phone_number, reply)
        except Exception as e:
            logger.error("event %s: failed to send reply: %s", event_id, e)

    await session.commit()
    logger.info("event %s: processed as %s for worker %s", event_id, event_type, worker.name)
