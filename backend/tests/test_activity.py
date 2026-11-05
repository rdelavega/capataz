import uuid

from app.models.event import Event
from app.services.activity import classify

JOB = uuid.uuid4()


def _ev(event_type: str, msg: dict | None = None, **kw) -> Event:
    mid = f"wamid.{uuid.uuid4()}"
    raw = {"entry": [{"changes": [{"value": {"messages": [{"id": mid, **(msg or {})}]}}]}]}
    return Event(id=uuid.uuid4(), whatsapp_message_id=mid, raw_payload=raw, event_type=event_type, **kw)


def _boton(payload: str, title: str) -> dict:
    return {"type": "interactive", "interactive": {"type": "button_reply", "button_reply": {"id": payload, "title": title}}}


def test_boton_enterado_es_actividad_del_trabajo() -> None:
    c = classify(_ev("text", _boton(f"visto::{JOB}", "👍 Enterado"), job_id=JOB, text_content="👍 Enterado"))
    assert c == {"kind": "enterado", "label": "Enterado", "text": None}


def test_boton_de_plantilla_tengo_un_problema() -> None:
    msg = {"type": "button", "button": {"payload": f"atrasado::{JOB}", "text": "Tengo un problema"}}
    assert classify(_ev("text", msg, job_id=JOB))["kind"] == "problema"


def test_ya_termine_escrito_con_trabajo() -> None:
    c = classify(_ev("text", {"type": "text"}, job_id=JOB, text_content="ya terminamos"))
    assert c["kind"] == "termino"


def test_explicacion_del_problema() -> None:
    c = classify(_ev("audio", {"type": "audio"}, job_id=JOB, transcription="no llegó el cemento"))
    assert c == {"kind": "problema_detalle", "label": "Explicó el problema", "text": "no llegó el cemento"}


def test_texto_suelto_es_reporte() -> None:
    assert classify(_ev("text", {"type": "text"}, text_content="ocupo alambre"))["kind"] == "report"


def test_elegir_de_que_trabajo_es_la_foto_no_se_muestra() -> None:
    c = classify(_ev("text", _boton(f"foto::{uuid.uuid4()}::{JOB}", "1. Colado"), job_id=None, text_content="1. Colado"))
    assert c["kind"] == "ignorar"


def test_evento_con_ubicacion_borrada_no_truena() -> None:
    e = Event(id=uuid.uuid4(), whatsapp_message_id="x", raw_payload={"purged": "location"}, event_type="text",
              text_content="hola")
    assert classify(e)["kind"] == "report"
