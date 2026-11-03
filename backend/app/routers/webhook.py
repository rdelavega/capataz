import hashlib
import hmac
import json
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


def is_valid_signature(body: bytes, signature_header: str | None, app_secret: str) -> bool:
    """Verifica X-Hub-Signature-256: HMAC-SHA256 del body crudo con el App Secret."""
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.removeprefix("sha256="))


async def verified_body(request: Request) -> bytes:
    """Lee el body crudo y valida la firma de Meta antes de tocar la DB."""
    body = await request.body()
    if settings.whatsapp_app_secret:
        signature = request.headers.get("X-Hub-Signature-256")
        if not is_valid_signature(body, signature, settings.whatsapp_app_secret):
            logger.warning("Webhook rechazado: firma X-Hub-Signature-256 inválida")
            raise HTTPException(status_code=401, detail="Firma inválida")
    else:
        logger.warning("WHATSAPP_APP_SECRET no configurado: webhook sin validar firma")
    return body


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
    background_tasks: BackgroundTasks,
    body: bytes = Depends(verified_body),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Recibe mensajes de WhatsApp Cloud API. Responde 200 inmediatamente."""
    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="JSON inválido")
    company_id = uuid.UUID(settings.company_id)

    # Extraer mensajes del payload (puede ser solo un status update).
    # Meta puede mandar varios mensajes en un POST; cada evento guarda el
    # payload completo y el parser localiza su mensaje por whatsapp_message_id.
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
