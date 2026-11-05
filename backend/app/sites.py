"""
Cómo le llama cada empresa a sus lugares de trabajo. Las cuatro palabras son
femeninas, así que "la", "una", "nueva" y "sin" sirven para todas.
"""
SITE_LABELS: dict[str, str] = {
    "obra": "obras",          # construcción
    "sucursal": "sucursales",  # talleres
    "ruta": "rutas",           # distribuidoras
    "zona": "zonas",           # servicios de campo
}
DEFAULT_SITE = "obra"


def site_or_default(value: str | None) -> str:
    return value if value in SITE_LABELS else DEFAULT_SITE
