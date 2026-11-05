import io

import pytest
from fastapi import HTTPException
from PIL import Image

from app.routers.workers import PROFILE_PHOTO_PX, _profile_jpeg


def test_foto_grande_y_vertical_queda_cuadrada_y_ligera() -> None:
    buf = io.BytesIO()
    Image.new("RGB", (3000, 4000), (120, 80, 40)).save(buf, "PNG")
    out = _profile_jpeg(buf.getvalue())
    with Image.open(io.BytesIO(out)) as im:
        assert im.format == "JPEG" and im.size == (PROFILE_PHOTO_PX, PROFILE_PHOTO_PX)
    assert len(out) < 100_000


def test_archivo_que_no_es_foto() -> None:
    with pytest.raises(HTTPException) as e:
        _profile_jpeg(b"%PDF-1.4 no soy foto")
    assert e.value.status_code == 422
