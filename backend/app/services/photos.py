"""
Fotos repetidas: alguien que manda la misma foto de la obra varios días.

WhatsApp quita los metadatos (fecha, GPS), así que se compara el contenido con
una huella perceptual (dHash de 64 bits): dos copias de la misma foto, aunque
WhatsApp la haya vuelto a comprimir, dan huellas casi iguales.

El umbral es estricto a propósito. Dos fotos distintas del mismo muro desde el
mismo ángulo pueden parecerse; marcar a alguien por error es peor que dejar
pasar una. Y el sistema nunca acusa: el dueño ve las dos fotos lado a lado y
decide.
"""
import io
import uuid
from datetime import datetime, timedelta

from PIL import Image, ImageOps
from sqlalchemy import select

from app.config import settings
from app.models.event import Event
from app.models.worker import Worker

MAX_DISTANCE = 2
# Fotos casi lisas (bolsillo, pared blanca, negro) dan huellas sin información
# que coinciden entre sí; esas no se comparan.
MIN_DETAIL_BITS = 8


def photo_hash(data: bytes) -> str | None:
    try:
        with Image.open(io.BytesIO(data)) as im:
            gray = ImageOps.exif_transpose(im).convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    except Exception:
        return None
    px = list(gray.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | int(px[row * 9 + col] > px[row * 9 + col + 1])
    return f"{bits:016x}"


def hamming(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def has_detail(h: str) -> bool:
    ones = int(h, 16).bit_count()
    return MIN_DETAIL_BITS <= ones <= 64 - MIN_DETAIL_BITS


def is_duplicate(a: str, b: str) -> bool:
    return has_detail(a) and has_detail(b) and hamming(a, b) <= MAX_DISTANCE


async def find_duplicate(session, company_id: uuid.UUID, event_id: uuid.UUID, h: str,
                         now: datetime) -> uuid.UUID | None:
    """La foto anterior (de cualquier trabajador) que es la misma que esta."""
    if not has_detail(h):
        return None
    since = now - timedelta(days=settings.duplicate_photo_days)
    rows = (await session.execute(
        select(Event.id, Event.photo_hash).where(
            Event.company_id == company_id, Event.photo_hash.is_not(None),
            Event.received_at >= since, Event.id != event_id,
        ).order_by(Event.received_at)
    )).all()
    return next((rid for rid, other in rows if is_duplicate(h, other)), None)


async def load_originals(session, events) -> dict[uuid.UUID, dict]:
    """Para las fotos marcadas como repetidas: la foto original, para mostrarlas lado a lado."""
    ids = {e.duplicate_of_id for e in events if e.duplicate_of_id}
    if not ids:
        return {}
    rows = (await session.execute(
        select(Event, Worker.name).outerjoin(Worker, Event.worker_id == Worker.id).where(Event.id.in_(ids))
    )).tuples()
    return {
        e.id: {"id": str(e.id), "url": e.media_url, "received_at": e.received_at.isoformat(), "worker_name": name}
        for e, name in rows
    }


def photo_dict(p: Event, originals: dict[uuid.UUID, dict], **extra) -> dict:
    """Una foto para el dashboard, con la original si es repetida."""
    return {
        "id": str(p.id), "url": p.media_url, "received_at": p.received_at.isoformat(),
        "caption": p.text_content, **extra,
        "duplicate_of": originals.get(p.duplicate_of_id) if p.duplicate_of_id else None,
    }
