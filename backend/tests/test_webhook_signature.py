import hashlib
import hmac

from app.routers.webhook import is_valid_signature

SECRET = "app-secret"
BODY = b'{"entry": []}'


def _sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_firma_valida() -> None:
    assert is_valid_signature(BODY, _sign(BODY), SECRET)


def test_firma_con_otro_secreto() -> None:
    assert not is_valid_signature(BODY, _sign(BODY, "otro"), SECRET)


def test_body_alterado() -> None:
    assert not is_valid_signature(b'{"entry": [1]}', _sign(BODY), SECRET)


def test_sin_header_o_formato_raro() -> None:
    assert not is_valid_signature(BODY, None, SECRET)
    assert not is_valid_signature(BODY, "", SECRET)
    assert not is_valid_signature(BODY, hmac.new(SECRET.encode(), BODY, hashlib.sha256).hexdigest(), SECRET)


def test_endpoint_rechaza_firma_invalida(monkeypatch) -> None:
    from fastapi.testclient import TestClient

    from app.config import settings
    from app.db import get_db
    from app.main import app

    async def no_db():
        raise AssertionError("no debe tocar la DB con firma inválida")
        yield  # pragma: no cover

    monkeypatch.setattr(settings, "whatsapp_app_secret", SECRET)
    app.dependency_overrides[get_db] = no_db
    try:
        client = TestClient(app)
        resp = client.post(
            "/webhook/whatsapp",
            content=BODY,
            headers={"X-Hub-Signature-256": _sign(BODY, "otro")},
        )
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.clear()
