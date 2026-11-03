import asyncio
from datetime import datetime, timedelta, timezone
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.attendance import AttendanceDaily
from app.models.event import Event
from app.models.job import Job
from app.services import parser

WORKER = SimpleNamespace(id=uuid.uuid4(), name="Luis Pech")


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.value or []


class FakeSession:
    """Responde los select en orden: primero el worker, luego la asistencia de hoy."""

    def __init__(self, event: Event, worker, attendance=None, extra=None):
        self.event = event
        self.results = [worker, *(extra or []), attendance]
        self.added: list = []

    async def get(self, model, id_):
        return self.event

    async def execute(self, stmt):
        return FakeResult(self.results.pop(0) if self.results else None)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        pass


def _payload(*messages: dict) -> dict:
    return {"entry": [{"changes": [{"value": {"messages": list(messages)}}]}]}


def _text(msg_id: str, body: str) -> dict:
    return {"id": msg_id, "from": "5219991234567", "type": "text", "text": {"body": body}}


@pytest.fixture
def sent(monkeypatch) -> AsyncMock:
    mock = AsyncMock()
    monkeypatch.setattr(parser.whatsapp, "send_text_message", mock)
    return mock


def _run(event: Event, worker=WORKER, attendance=None, extra=None, after=None) -> FakeSession:
    session = FakeSession(event, worker, attendance, extra)
    session.results.extend(after or [])
    asyncio.run(parser._process(event.id, session))
    return session


def _event(payload: dict, msg_id: str) -> Event:
    return Event(id=uuid.uuid4(), whatsapp_message_id=msg_id, raw_payload=payload)


def test_batch_processes_its_own_message(sent) -> None:
    payload = _payload(_text("wamid.1", "hola"), _text("wamid.2", "ocupo mortero"))
    event = _event(payload, "wamid.2")
    _run(event)
    assert event.text_content == "ocupo mortero"


def test_unregistered_number_gets_reply(sent) -> None:
    _run(_event(_payload(_text("wamid.1", "hola")), "wamid.1"), worker=None)
    sent.assert_awaited_once_with("+5219991234567", parser.UNREGISTERED_REPLY)


def test_checkin_creates_attendance(sent) -> None:
    session = _run(_event(_payload(_text("wamid.1", "Presente")), "wamid.1"))
    assert any(isinstance(o, AttendanceDaily) for o in session.added)
    assert "¡Presente!" in sent.await_args.args[1]


def test_photo_ack_keeps_caption_and_reminds_checkin(sent, monkeypatch) -> None:
    monkeypatch.setattr(parser.whatsapp, "download_media", AsyncMock(return_value=b"jpg"))
    monkeypatch.setattr(parser.storage, "upload_to_r2", lambda *a: "https://r2/x.jpg")
    msg = {"id": "wamid.1", "from": "5219991234567", "type": "image",
           "image": {"id": "m1", "caption": "Así va la losa"}}
    event = _event(_payload(msg), "wamid.1")
    _run(event)
    assert event.event_type == "photo"
    assert event.text_content == "Así va la losa"
    reply = sent.await_args.args[1]
    assert reply.startswith("📸 Foto recibida, Luis") and "presente" in reply


def test_ack_skips_checkin_hint_when_already_checked_in(sent) -> None:
    attendance = AttendanceDaily(status="presente")
    _run(_event(_payload(_text("wamid.1", "ocupo mortero")), "wamid.1"), attendance=attendance)
    assert sent.await_args.args[1] == "👍 Recibido, Luis. Ya quedó anotado."


# ─── Tareas: "Terminé" → por revisar → foto de evidencia ──────────────────────

def _button(msg_id: str, payload: str) -> dict:
    return {"id": msg_id, "from": "5219991234567", "type": "interactive",
            "interactive": {"type": "button_reply", "button_reply": {"id": payload, "title": "✅ Ya terminé"}}}


def _job(status: str = "en_progreso", **kw) -> Job:
    return Job(id=uuid.uuid4(), title="Colado de losa", status=status, worker_id=WORKER.id, **kw)


def test_terminado_queda_por_revisar_y_pide_foto(sent) -> None:
    job = _job()
    event = _event(_payload(_button("wamid.1", f"completado::{job.id}")), "wamid.1")
    _run(event, extra=[job])
    assert job.status == "por_revisar"
    assert job.completed_at is not None
    assert event.job_id == job.id
    assert "foto" in sent.await_args.args[1]


def test_boton_de_plantilla_tambien_funciona(sent) -> None:
    job = _job()
    msg = {"id": "wamid.1", "from": "5219991234567", "type": "button",
           "button": {"payload": f"en_progreso::{job.id}", "text": "Sigo en eso"}}
    _run(_event(_payload(msg), "wamid.1"), extra=[job])
    assert job.status == "en_progreso"


def test_foto_despues_de_terminado_se_liga_a_la_tarea(sent, monkeypatch) -> None:
    monkeypatch.setattr(parser.whatsapp, "download_media", AsyncMock(return_value=b"jpg"))
    monkeypatch.setattr(parser.storage, "upload_to_r2", lambda *a: "https://r2/x.jpg")
    job = _job("por_revisar", completed_at=datetime.now(tz=timezone.utc) - timedelta(minutes=5))
    msg = {"id": "wamid.1", "from": "5219991234567", "type": "image", "image": {"id": "m1"}}
    event = _event(_payload(msg), "wamid.1")
    _run(event, attendance=AttendanceDaily(status="presente"), after=[[job]])
    assert event.job_id == job.id
    assert "Colado de losa" in sent.await_args.args[1]


def test_foto_con_una_sola_tarea_abierta_es_avance(sent, monkeypatch) -> None:
    monkeypatch.setattr(parser.whatsapp, "download_media", AsyncMock(return_value=b"jpg"))
    monkeypatch.setattr(parser.storage, "upload_to_r2", lambda *a: "https://r2/x.jpg")
    job = _job("pendiente")
    msg = {"id": "wamid.1", "from": "5219991234567", "type": "image", "image": {"id": "m1"}}
    event = _event(_payload(msg), "wamid.1")
    _run(event, attendance=AttendanceDaily(status="presente"), after=[[job]])
    assert event.job_id == job.id
    assert job.status == "en_progreso"


def test_foto_con_varias_tareas_no_adivina(sent, monkeypatch) -> None:
    monkeypatch.setattr(parser.whatsapp, "download_media", AsyncMock(return_value=b"jpg"))
    monkeypatch.setattr(parser.storage, "upload_to_r2", lambda *a: "https://r2/x.jpg")
    msg = {"id": "wamid.1", "from": "5219991234567", "type": "image", "image": {"id": "m1"}}
    event = _event(_payload(msg), "wamid.1")
    _run(event, attendance=AttendanceDaily(status="presente"), after=[[_job(), _job()]])
    assert event.job_id is None


def test_checkin_tarde(sent, monkeypatch) -> None:
    monkeypatch.setattr(parser, "is_late", lambda now: True)
    session = _run(_event(_payload(_text("wamid.1", "presente")), "wamid.1"))
    att = next(o for o in session.added if isinstance(o, AttendanceDaily))
    assert att.status == "tarde"


def test_boton_hoy_no_voy_marca_ausente(sent) -> None:
    msg = {"id": "wamid.1", "from": "5219991234567", "type": "button",
           "button": {"payload": "ausente", "text": "Hoy no voy"}}
    session = _run(_event(_payload(msg), "wamid.1"))
    att = next(o for o in session.added if isinstance(o, AttendanceDaily))
    assert att.status == "ausente"
