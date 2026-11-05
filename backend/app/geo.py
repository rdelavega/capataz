"""
Verificación de presencia: ¿el check-in se hizo desde la obra?

Se compara la ubicación que manda el trabajador con la de las obras de la
empresa. Si cae dentro del radio de alguna, está "en obra" (aunque no sea la
suya: a veces los mandan a otra). Si no, se guarda a cuántos metros quedó de
su obra, nunca dónde estaba: si checó desde su casa, el dueño no tiene por qué
saber dónde vive.
"""
import math
import re
import uuid
from dataclasses import dataclass
from urllib.parse import unquote, urlparse

import httpx

from app.config import settings

EARTH_RADIUS_M = 6_371_000

_NUM = r"(-?\d{1,3}(?:\.\d+)?)"
# En orden de preferencia: el pin del lugar (!3d!4d), parámetros de búsqueda y
# al final el centro del mapa (@lat,lng), que puede no ser el pin.
_URL_PATTERNS = [
    re.compile(rf"!3d{_NUM}!4d{_NUM}"),
    re.compile(rf"[?&](?:q|query|ll|destination|center)={_NUM},\s*\+?{_NUM}"),
    re.compile(rf"/search/{_NUM},\s*\+?{_NUM}"),
    re.compile(rf"@{_NUM},{_NUM}"),
]
_PLAIN = re.compile(rf"^\s*{_NUM}\s*,\s*{_NUM}\s*$")
# Links cortos de Google Maps: hay que seguir la redirección para ver las coordenadas.
SHORT_LINK_HOSTS = {"maps.app.goo.gl", "goo.gl", "g.co"}


def _valid(lat: float, lng: float) -> bool:
    return -90 <= lat <= 90 and -180 <= lng <= 180 and not (lat == 0 and lng == 0)


def parse_location(text: str) -> tuple[float, float] | None:
    """'21.019, -89.62' o un link largo de Google Maps → (lat, lng)."""
    text = unquote(text.strip())
    candidates = [_PLAIN.match(text)] + [p.search(text) for p in _URL_PATTERNS]
    for m in candidates:
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
            if _valid(lat, lng):
                return lat, lng
    return None


async def resolve_location(text: str) -> tuple[float, float] | None:
    """Como parse_location, pero también abre links cortos (maps.app.goo.gl/…)."""
    found = parse_location(text)
    if found or not text.strip().startswith("http"):
        return found
    if urlparse(text.strip()).hostname not in SHORT_LINK_HOSTS:
        return None
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=8) as client:
            resp = await client.get(text.strip())
    except httpx.HTTPError:
        return None
    return parse_location(str(resp.url))


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia en metros (haversine)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def fmt_distance(meters: int | float) -> str:
    if meters < 1000:
        return f"{round(meters / 10) * 10:.0f} m"
    return f"{meters / 1000:.1f} km"


@dataclass
class LocationCheck:
    status: str                     # en_sitio · lejos · sin_referencia
    distance_m: int | None          # a la obra de referencia
    branch_id: uuid.UUID | None     # obra donde está (en_sitio) o la suya (lejos)
    branch_name: str | None


def check_location(lat: float, lng: float, branches: list, expected_branch_id: uuid.UUID | None) -> LocationCheck:
    """branches: objetos con id, name, latitude, longitude, geofence_m."""
    located = [b for b in branches if b.latitude is not None and b.longitude is not None]
    if not located:
        return LocationCheck("sin_referencia", None, None, None)

    dist = {b.id: distance_m(lat, lng, b.latitude, b.longitude) for b in located}
    inside = [b for b in located if dist[b.id] <= (b.geofence_m or settings.geofence_meters)]
    if inside:
        b = min(inside, key=lambda b: dist[b.id])
        return LocationCheck("en_sitio", round(dist[b.id]), b.id, b.name)

    ref = next((b for b in located if b.id == expected_branch_id), None) or min(located, key=lambda b: dist[b.id])
    return LocationCheck("lejos", round(dist[ref.id]), ref.id, ref.name)
