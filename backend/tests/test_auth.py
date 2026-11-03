import jwt
from fastapi.testclient import TestClient

from app.config import settings
from app.db import get_db
from app.main import app
from app.routers import auth


class _NoUser:
    async def execute(self, _):
        class R:
            def scalar_one_or_none(self):
                return None
        return R()


def test_login_bloquea_tras_5_fallos() -> None:
    auth._failures.clear()

    async def fake_db():
        yield _NoUser()

    app.dependency_overrides[get_db] = fake_db
    try:
        c = TestClient(app)
        body = {"email": "dueno@ejemplo.mx", "password": "mala"}
        codes = [c.post("/auth/login", json=body).status_code for _ in range(6)]
        assert codes == [401] * 5 + [429]
    finally:
        app.dependency_overrides.clear()
        auth._failures.clear()


def test_token_firmado_con_otra_clave_no_sirve() -> None:
    forged = jwt.encode({"sub": "dueno@ejemplo.mx"}, "otra-clave", algorithm="HS256")
    c = TestClient(app)
    r = c.get("/dashboard/today", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


def test_token_valido_se_decodifica() -> None:
    token = auth._create_token("dueno@ejemplo.mx")
    assert jwt.decode(token, settings.secret_key, algorithms=["HS256"])["sub"] == "dueno@ejemplo.mx"
