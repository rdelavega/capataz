import re

import httpx

from app.config import settings

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"


async def download_media(media_id: str) -> bytes:
    """Descarga un archivo de media de WhatsApp Cloud API."""
    headers = {"Authorization": f"Bearer {settings.whatsapp_token}"}
    async with httpx.AsyncClient() as client:
        # Primero obtenemos la URL real del archivo
        resp = await client.get(f"{GRAPH_API_BASE}/{media_id}", headers=headers)
        resp.raise_for_status()
        media_url = resp.json()["url"]

        # Descargamos el contenido
        file_resp = await client.get(media_url, headers=headers)
        file_resp.raise_for_status()
        return file_resp.content


async def send_interactive_buttons(to: str, body_text: str, buttons: list[dict]) -> None:
    """Envía un mensaje con botones de respuesta rápida (máx. 3 botones)."""
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": body_text},
            "action": {"buttons": buttons},
        },
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GRAPH_API_BASE}/{settings.whatsapp_phone_number_id}/messages",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()


async def send_interactive_list(to: str, body_text: str, button_label: str, rows: list[dict]) -> None:
    """Lista desplegable (hasta 10 opciones). rows: [{"id", "title" (≤24), "description" (≤72)}]."""
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {"text": body_text},
            "action": {"button": button_label[:20], "sections": [{"title": "Trabajos", "rows": rows[:10]}]},
        },
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GRAPH_API_BASE}/{settings.whatsapp_phone_number_id}/messages",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()


async def send_location_request(to: str, body_text: str) -> None:
    """Mensaje con botón "Enviar ubicación": un toque y comparte dónde está."""
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "location_request_message",
            "body": {"text": body_text},
            "action": {"name": "send_location"},
        },
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GRAPH_API_BASE}/{settings.whatsapp_phone_number_id}/messages",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()


async def send_text_message(to: str, body: str) -> None:
    """Envía un mensaje de texto al trabajador. Requiere que el worker haya escrito primero."""
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": body},
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GRAPH_API_BASE}/{settings.whatsapp_phone_number_id}/messages",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()


def _clean_param(value: str) -> str:
    """Meta rechaza parámetros con saltos de línea, tabs o 4+ espacios seguidos."""
    return re.sub(r"\s+", " ", value).strip() or "-"


def build_template_payload(
    to: str,
    name: str,
    params: list[str],
    quick_reply_payloads: list[str] | None = None,
) -> dict:
    components: list[dict] = [{
        "type": "body",
        "parameters": [{"type": "text", "text": _clean_param(p)} for p in params],
    }]
    for i, payload in enumerate(quick_reply_payloads or []):
        components.append({
            "type": "button",
            "sub_type": "quick_reply",
            "index": str(i),
            "parameters": [{"type": "payload", "payload": payload}],
        })
    return {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": name,
            "language": {"code": settings.wa_template_lang},
            "components": components,
        },
    }


async def send_template(
    to: str,
    name: str,
    params: list[str],
    quick_reply_payloads: list[str] | None = None,
) -> None:
    """Envía una plantilla aprobada. Funciona fuera de la ventana de 24 h (se cobra como utilidad)."""
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_token}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GRAPH_API_BASE}/{settings.whatsapp_phone_number_id}/messages",
            headers=headers,
            json=build_template_payload(to, name, params, quick_reply_payloads),
        )
        resp.raise_for_status()
