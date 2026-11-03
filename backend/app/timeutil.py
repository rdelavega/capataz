"""
Fechas en hora local de la empresa. El servidor (Railway) y la DB (Supabase)
corren en UTC; sin esto, a partir de las 6 pm en México el dashboard ya cree
que es mañana.
"""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func
from sqlalchemy.sql.elements import ColumnElement

from app.config import settings

TZ = ZoneInfo(settings.timezone)


def local_now() -> datetime:
    return datetime.now(tz=TZ)


def local_today() -> date:
    return local_now().date()


def local_date(column: ColumnElement) -> ColumnElement:
    """Fecha local de una columna timestamptz, para filtrar en SQL."""
    return cast(func.timezone(settings.timezone, column), Date)


def greeting(now: datetime | None = None) -> str:
    hour = (now or local_now()).hour
    if hour < 12:
        return "Buenos días"
    if hour < 19:
        return "Buenas tardes"
    return "Buenas noches"
