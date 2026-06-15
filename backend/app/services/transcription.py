import io

from openai import AsyncOpenAI

from app.config import settings

_client = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def transcribe(audio_bytes: bytes, filename: str = "audio.ogg") -> str:
    """Transcribe audio usando Whisper. Retorna texto vacío si falla."""
    client = _get_client()
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename
    try:
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            language="es",
        )
        return response.text
    except Exception:
        return ""
