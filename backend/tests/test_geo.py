import uuid
from types import SimpleNamespace

from app import geo

ALTABRISA = SimpleNamespace(id=uuid.uuid4(), name="Obra Altabrisa", latitude=21.0190, longitude=-89.6237, geofence_m=None)
CHOLUL = SimpleNamespace(id=uuid.uuid4(), name="Obra Cholul", latitude=21.0449, longitude=-89.5555, geofence_m=None)
SIN_UBICACION = SimpleNamespace(id=uuid.uuid4(), name="Taller", latitude=None, longitude=None, geofence_m=None)


def test_parse_coordenadas_sueltas() -> None:
    assert geo.parse_location("21.0190, -89.6237") == (21.019, -89.6237)


def test_parse_link_largo_prefiere_el_pin_al_centro_del_mapa() -> None:
    url = ("https://www.google.com/maps/place/Altabrisa/@21.0200,-89.6200,17z/"
           "data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d21.0190!4d-89.6237")
    assert geo.parse_location(url) == (21.019, -89.6237)


def test_parse_link_con_q() -> None:
    assert geo.parse_location("https://maps.google.com/?q=21.019%2C-89.6237") == (21.019, -89.6237)


def test_parse_basura_o_fuera_de_rango() -> None:
    assert geo.parse_location("Calle 20 por 15, Altabrisa") is None
    assert geo.parse_location("95.0, -89.6") is None
    assert geo.parse_location("0, 0") is None


def test_dentro_del_radio_esta_en_obra() -> None:
    check = geo.check_location(21.0195, -89.6240, [ALTABRISA, CHOLUL], ALTABRISA.id)
    assert check.status == "en_sitio" and check.branch_name == "Obra Altabrisa"
    assert check.distance_m < 100


def test_en_otra_obra_de_la_empresa_tambien_cuenta() -> None:
    check = geo.check_location(21.0449, -89.5555, [ALTABRISA, CHOLUL], ALTABRISA.id)
    assert check.status == "en_sitio" and check.branch_name == "Obra Cholul"


def test_lejos_mide_contra_su_obra() -> None:
    check = geo.check_location(20.9700, -89.6200, [ALTABRISA, CHOLUL], ALTABRISA.id)
    assert check.status == "lejos" and check.branch_name == "Obra Altabrisa"
    assert 5000 < check.distance_m < 6000


def test_radio_propio_de_la_obra() -> None:
    grande = SimpleNamespace(**{**vars(ALTABRISA), "geofence_m": 1000})
    assert geo.check_location(21.0250, -89.6237, [grande], grande.id).status == "en_sitio"
    assert geo.check_location(21.0250, -89.6237, [ALTABRISA], ALTABRISA.id).status == "lejos"


def test_sin_obras_con_ubicacion_no_se_compara() -> None:
    assert geo.check_location(21.0, -89.6, [SIN_UBICACION], SIN_UBICACION.id).status == "sin_referencia"


def test_fmt_distance() -> None:
    assert geo.fmt_distance(347) == "350 m"
    assert geo.fmt_distance(2345) == "2.3 km"
