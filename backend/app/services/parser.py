"""
Procesa un evento ya insertado en DB: identifica al worker, clasifica el tipo
de mensaje y dispara acciones secundarias (attendance, media, transcripción,
tareas).
"""
import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app import geo
from app.config import settings
from app.db import AsyncSessionLocal
from app.models.attendance import AttendanceDaily
from app.models.branch import Branch
from app.models.crew import Crew
from app.models.event import Event
from app.models.job import Job
from app.models.worker import Worker
from app.phone import phone_variants
from app.services import photos, storage, transcription, whatsapp
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

# Números no registrados ya respondidos hoy. Cada respuesta cuesta dinero: sin
# esto, cualquiera podría escribirle al bot sin parar y generar cargos.
_unregistered_replied: dict[str, date] = {}

# Botones que mandan los mensajes del bot: "<estado>::<job_id>" o una acción simple.
JOB_BUTTON_STATUSES = {"visto", "completado", "en_progreso", "atrasado"}
BUTTON_CHECKIN = "checkin"
BUTTON_ABSENT = "ausente"
# "foto::<event_id>::<job_id>": el trabajador eligió a qué trabajo pertenece una foto.
PHOTO_CHOICE = "foto"

# Una foto que llega dentro de esta ventana después de "Terminé" es la evidencia de esa tarea.
REVIEW_PHOTO_WINDOW = timedelta(hours=6)
OPEN_STATUSES = ("pendiente", "en_progreso", "atrasado")

LOCATION_ASK = "Toca *Enviar ubicación* para confirmar que estás en la obra."
# Se dice una sola vez por trabajador: para qué se usa su ubicación y para qué no.
LOCATION_NOTICE = (
    "_Tu ubicación solo se usa para confirmar tu llegada a la obra. "
    "No te seguimos durante el día._"
)


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
        if interactive.get("type") == "list_reply":
            return interactive.get("list_reply", {}).get("id")
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


def _location_reply(check: geo.LocationCheck) -> str:
    if check.status == "en_sitio":
        return f"📍 Listo, quedaste registrado en *{check.branch_name}*."
    if check.status == "lejos":
        return (
            f"📍 Recibida. Te marca a {geo.fmt_distance(check.distance_m)} de *{check.branch_name}*. "
            "Si te mandaron a otro lado, avísale a tu jefe."
        )
    return "📍 Ubicación recibida, gracias."


async def _check_location(session, company_id: uuid.UUID, worker: Worker,
                          lat: float, lng: float) -> geo.LocationCheck:
    """Compara con las obras de la empresa. La obra esperada es la de su cuadrilla, o la suya."""
    branches = (await session.execute(
        select(Branch).where(Branch.company_id == company_id)
    )).scalars().all()
    expected = worker.branch_id
    if worker.crew_id:
        crew = (await session.execute(select(Crew).where(Crew.id == worker.crew_id))).scalar_one_or_none()
        if crew and crew.branch_id:
            expected = crew.branch_id
    return geo.check_location(lat, lng, branches, expected)


def _apply_location(attendance: AttendanceDaily, check: geo.LocationCheck, now: datetime) -> None:
    attendance.location_status = check.status
    attendance.location_distance_m = check.distance_m
    attendance.location_branch_id = check.branch_id
    attendance.location_at = now


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

    job = (await session.execute(select(Job).where(Job.id == job_uuid))).scalar_one_or_none()
    if job is not None and not _can_report(worker, job):
        job = None
    if job is None:
        logger.warning("job %s not found for worker %s", job_id_str, worker.id)
        return None

    if job.status == "completado":
        return f"👍 *{job.title}* ya estaba aprobada, {nombre}. ¡Gracias!"

    if status == "visto":
        job.acknowledged_at = job.acknowledged_at or datetime.now(tz=timezone.utc)
        return (
            f"👍 Anotado, {nombre}. Cuando terminen *{job.title}*, aprieta *Ya terminé* "
            "en este mensaje y manda foto."
        )

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


def _can_report(worker: Worker, job: Job) -> bool:
    """El trabajo es suyo, o es de su cuadrilla (sin persona asignada)."""
    if job.worker_id == worker.id:
        return True
    return bool(worker.crew_id and job.crew_id == worker.crew_id and not job.worker_id)


def _short(title: str, n: int) -> str:
    return title if len(title) <= n else title[: n - 1] + "…"


async def _ask_which_job(phone: str, event_id: uuid.UUID, jobs: list[Job]) -> None:
    """Varios trabajos abiertos: el trabajador elige con un toque de cuál es la foto."""
    jobs = sorted(jobs, key=lambda j: (j.due_date is None, j.due_date))
    body = "📸 Foto recibida. ¿De cuál trabajo es?"
    if len(jobs) <= 3:
        listado = "\n".join(f"{i + 1}. {j.title}" for i, j in enumerate(jobs))
        await whatsapp.send_interactive_buttons(
            phone, f"{body}\n\n{listado}",
            [{"type": "reply", "reply": {"id": f"{PHOTO_CHOICE}::{event_id}::{j.id}",
                                         "title": _short(f"{i + 1}. {j.title}", 20)}}
             for i, j in enumerate(jobs)],
        )
    else:
        await whatsapp.send_interactive_list(
            phone, body, "Elegir trabajo",
            [{"id": f"{PHOTO_CHOICE}::{event_id}::{j.id}", "title": _short(j.title, 24),
              "description": _short(j.title, 72) if len(j.title) > 24 else ""}
             for j in jobs[:10]],
        )


async def _handle_photo_choice(session, worker: Worker, payload: str) -> str | None:
    """El trabajador eligió el trabajo de una foto que mandó antes."""
    _, event_str, job_str = (payload.split("::") + ["", ""])[:3]
    try:
        photo_id, job_id = uuid.UUID(event_str), uuid.UUID(job_str)
    except ValueError:
        return None
    photo = await session.get(Event, photo_id)
    job = (await session.execute(select(Job).where(Job.id == job_id))).scalar_one_or_none()
    if photo is None or job is None or photo.worker_id != worker.id or not _can_report(worker, job):
        return None
    photo.job_id = job.id
    if job.status == "pendiente":
        job.status = "en_progreso"
    return f"👍 Listo, la foto quedó en *{job.title}*."


async def _link_photo_to_job(session, worker: Worker, now: datetime) -> tuple[Job | None, list[Job]]:
    """
    Decide a qué trabajo pertenece una foto. Devuelve (trabajo, opciones):
    1. El que el trabajador (o su cuadrilla) acaba de marcar como terminado.
    2. Si solo hay uno abierto, ese (evidencia de avance).
    3. Si hay varios, ninguno: se regresan las opciones para preguntarle.
    """
    mine = Job.worker_id == worker.id
    if worker.crew_id:
        mine = mine | ((Job.crew_id == worker.crew_id) & Job.worker_id.is_(None))
    jobs = (await session.execute(
        select(Job).where(mine, Job.status.in_(("por_revisar", *OPEN_STATUSES)))
    )).scalars().all()

    in_review = [
        j for j in jobs
        if j.status == "por_revisar" and j.completed_at and now - j.completed_at <= REVIEW_PHOTO_WINDOW
    ]
    if in_review:
        return max(in_review, key=lambda j: j.completed_at), []

    open_jobs = [j for j in jobs if j.status in OPEN_STATUSES]
    if len(open_jobs) == 1:
        job = open_jobs[0]
        if job.status == "pendiente":
            job.status = "en_progreso"
        return job, []
    return None, open_jobs


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
        if _unregistered_replied.get(phone_number) != local_today():
            _unregistered_replied[phone_number] = local_today()
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
    ask_choices: list[Job] = []

    if msg_type == "text":
        text_content = msg.get("text", {}).get("body", "")
        event_type = "checkin" if _is_checkin(text_content) else "text"

    elif msg_type == "image":
        event_type = "photo"
        text_content = msg.get("image", {}).get("caption")
        media_id = msg.get("image", {}).get("id")
        if media_id:
            try:
                image_bytes = await whatsapp.download_media(media_id)
                key = f"media/{company_id}/{event_id}.jpg"
                media_url = storage.upload_to_r2(image_bytes, key, "image/jpeg")
            except Exception as e:
                image_bytes = None
                logger.error("event %s: failed to download/upload image: %s", event_id, e)
            if image_bytes and (h := photos.photo_hash(image_bytes)):
                event.photo_hash = h
                event.duplicate_of_id = await photos.find_duplicate(session, company_id, event_id, h, now)

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
        elif payload.startswith(f"{PHOTO_CHOICE}::"):
            choice_reply = await _handle_photo_choice(session, worker, payload)
            if choice_reply:
                reply = choice_reply
                already_replied = True
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

    location_prompt: str | None = None
    if event_type in ("checkin", "location") and (event_type == "checkin" or latitude is not None):
        # Check-in (o ubicación, que también cuenta como llegada) → upsert en attendance_daily
        status = "tarde" if is_late(now) else "presente"
        is_new = attendance is None
        if is_new:
            attendance = AttendanceDaily(
                company_id=company_id,
                worker_id=worker.id,
                work_date=today,
                status=status,
                checkin_at=now,
                event_id=event.id,
            )
            session.add(attendance)
        else:
            if attendance.status == "ausente":
                attendance.status = status
            attendance.checkin_at = attendance.checkin_at or now

        if event_type == "location":
            check = await _check_location(session, company_id, worker, latitude, longitude)
            # Una ubicación "en obra" no se sobreescribe; una lejana sí (fue por material y llegó).
            if attendance.location_status != "en_sitio":
                _apply_location(attendance, check, now)
                reply = _location_reply(check)
            else:
                reply = f"📍 Ubicación recibida, {nombre}. Gracias."
            if is_new:
                reply = f"✅ ¡Presente! {greeting()}, {nombre}. {reply}"
        else:
            reply = (
                f"✅ ¡Presente! {greeting()}, {nombre}. Tu registro quedó guardado."
                if is_new else f"👍 Ya tenías registro de hoy, {nombre}. ¡Que te vaya bien!"
            )
            if settings.checkin_ask_location and attendance.location_status != "en_sitio":
                location_prompt = f"{reply}\n\n{LOCATION_ASK}"
                if worker.location_notice_at is None:
                    location_prompt += f"\n\n{LOCATION_NOTICE}"
                    worker.location_notice_at = now

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
        job, choices = await _link_photo_to_job(session, worker, now)
        if choices:
            ask_choices = choices
        elif job is not None:
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
    if ask_choices:
        try:
            await _ask_which_job(phone_number, event_id, ask_choices)
        except Exception as e:
            logger.error("event %s: failed to ask which job: %s", event_id, e)
    if location_prompt:
        try:
            await whatsapp.send_location_request(phone_number, location_prompt)
            reply = None
        except Exception as e:
            logger.error("event %s: failed to ask for location: %s", event_id, e)
    if reply:
        await _safe_send(event_id, phone_number, reply)
    logger.info("event %s: processed as %s for worker %s", event_id, event_type, worker.name)
