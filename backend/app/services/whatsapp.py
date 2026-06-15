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
