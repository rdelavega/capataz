"""
Qué significa cada mensaje para el dueño.

La bitácora del día (Registros) y la historia de un trabajo cuentan lo mismo:
no "botón: 👍 Enterado" sino "Enterado de Colado de losa"; no "texto: ya
terminé" sino "Dijo que terminó". Los acuses y las respuestas a botones se
vuelven actividad del trabajo; lo que el trabajador cuenta (textos y audios
sueltos) son sus reportes.
"""
from app.models.event import Event
from app.services.parser import _button_payload, _extract_message, _is_done

# Lo que quiere decir cada botón (payload "<accion>::<job_id>")
BUTTON_KIND = {
    "visto": ("enterado", "Enterado"),
    "completado": ("termino", "Dijo que terminó"),
    "en_progreso": ("en_progreso", "Sigue en progreso"),
    "atrasado": ("problema", "Reportó un problema"),
}


def classify(e: Event) -> dict:
    """
    {"kind": ..., "label": ..., "text": ...}. kind:
    checkin · location · ausente · photo · report (texto o audio suelto) ·
    enterado · termino · en_progreso · problema · problema_detalle · ignorar
    """
    said = e.transcription or e.text_content
    if e.event_type in ("checkin", "location", "photo"):
        return {"kind": e.event_type, "label": None, "text": said}

    msg = _extract_message(e.raw_payload or {}, e.whatsapp_message_id) if e.raw_payload else None
    payload = _button_payload(msg) if msg else None
    if payload:
        action = payload.partition("::")[0]
        if action in BUTTON_KIND:
            kind, label = BUTTON_KIND[action]
            return {"kind": kind, "label": label, "text": None}
        if action == "ausente":
            return {"kind": "ausente", "label": "Avisó que no viene", "text": None}
        return {"kind": "ignorar", "label": None, "text": None}  # elegir de qué trabajo es una foto, etc.

    if e.job_id and said:
        if _is_done(said):
            return {"kind": "termino", "label": "Dijo que terminó", "text": said}
        return {"kind": "problema_detalle", "label": "Explicó el problema", "text": said}
    if said:
        return {"kind": "report", "label": None, "text": said}
    return {"kind": "ignorar", "label": None, "text": None}
