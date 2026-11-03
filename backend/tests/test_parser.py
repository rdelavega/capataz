import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.models.attendance import AttendanceDaily
from app.models.event import Event
from app.services import parser

WORKER = SimpleNamespace(id=uuid.uuid4(), name="Luis Pech")


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeSession:
    """Responde los select en orden: primero el worker, luego la asistencia de hoy."""

    def __init__(self, event: Event, worker, attendance=None):
        self.event = event
        self.results = [worker, attendance]
        self.added: list = []

    async def get(self, model, id_):
        return self.event

    async def execute(self, stmt):
        return FakeResult(self.results.pop(0))

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


def _run(event: Event, worker=WORKER, attendance=None) -> FakeSession:
    session = FakeSession(event, worker, attendance)
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
