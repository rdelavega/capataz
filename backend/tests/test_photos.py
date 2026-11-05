import io
import random

from PIL import Image, ImageDraw

from app.services import photos


def _scene(seed: int) -> Image.Image:
    """Una 'foto' con formas al azar (para que tenga detalle, como una obra)."""
    rng = random.Random(seed)
    im = Image.new("RGB", (640, 480), (rng.randint(0, 255),) * 3)
    draw = ImageDraw.Draw(im)
    for _ in range(40):
        x, y = rng.randint(0, 600), rng.randint(0, 440)
        draw.rectangle((x, y, x + rng.randint(20, 200), y + rng.randint(20, 200)),
                       fill=tuple(rng.randint(0, 255) for _ in range(3)))
    return im


def _jpeg(im: Image.Image, quality: int, scale: float = 1.0) -> bytes:
    if scale != 1.0:
        im = im.resize((int(im.width * scale), int(im.height * scale)))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def test_la_misma_foto_recomprimida_es_repetida() -> None:
    scene = _scene(1)
    a = photos.photo_hash(_jpeg(scene, 90))
    b = photos.photo_hash(_jpeg(scene, 55, scale=0.6))  # WhatsApp la reenvía más chica y comprimida
    assert photos.is_duplicate(a, b)


def test_fotos_distintas_no_son_repetidas() -> None:
    hashes = [photos.photo_hash(_jpeg(_scene(seed), 85)) for seed in range(2, 12)]
    assert not any(photos.is_duplicate(a, b) for i, a in enumerate(hashes) for b in hashes[i + 1:])


def test_fotos_lisas_no_se_comparan() -> None:
    negra = photos.photo_hash(_jpeg(Image.new("RGB", (640, 480), (5, 5, 5)), 80))
    otra_negra = photos.photo_hash(_jpeg(Image.new("RGB", (640, 480), (8, 8, 8)), 60))
    assert not photos.has_detail(negra)
    assert not photos.is_duplicate(negra, otra_negra)


def test_bytes_que_no_son_imagen() -> None:
    assert photos.photo_hash(b"no soy jpg") is None
