import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.event import Event
from app.services.parser import process_event

router = APIRouter(prefix="/webhook", tags=["webhook"])
logger = logging.getLogger(__name__)


@router.get("/whatsapp")
async def verify_webhook(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
) -> Response:
    """Verificación del webhook por Meta. Devuelve el challenge si el token es correcto."""
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return Response(content=hub_challenge, media_type="text/plain")
    raise HTTPException(status_code=403, detail="Token de verificación inválido")


@router.post("/whatsapp", status_code=200)
async def receive_message(
    request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Recibe mensajes de WhatsApp Cloud API. Responde 200 inmediatamente."""
    payload = await request.json()
    company_id = uuid.UUID(settings.company_id)

    # Extraer mensajes del payload (puede ser solo un status update)
    messages_to_process: list[tuple[str, dict]] = []
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for msg in value.get("messages", []):
                    wa_msg_id = msg.get("id")
                    if wa_msg_id:
                        messages_to_process.append((wa_msg_id, payload))
    except Exception as e:
        logger.warning("Error parsing webhook payload: %s", e)
        return {"status": "ok"}

    for wa_msg_id, raw_payload in messages_to_process:
        event_id = uuid.uuid4()
        stmt = (
            pg_insert(Event)
            .values(
                id=event_id,
                company_id=company_id,
                whatsapp_message_id=wa_msg_id,
                raw_payload=raw_payload,
            )
            .on_conflict_do_nothing(index_elements=["whatsapp_message_id"])
            .returning(Event.id)
        )
        result = await session.execute(stmt)
        inserted_id = result.scalar_one_or_none()
        await session.commit()

        if inserted_id:
            background_tasks.add_task(process_event, inserted_id)

    return {"status": "ok"}
