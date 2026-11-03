"""
Fechas en hora local de la empresa. El servidor (Railway) y la DB (Supabase)
corren en UTC; sin esto, a partir de las 6 pm en México el dashboard ya cree
que es mañana.
"""
from datetime import date, datetime, time, timedelta
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


# ─── Jornada ──────────────────────────────────────────────────────────────────

def parse_hhmm(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


def rest_weekdays() -> set[int]:
    return {int(d) for d in settings.rest_weekdays.split(",") if d.strip()}


def is_rest_day(d: date) -> bool:
    return d.weekday() in rest_weekdays()


def late_cutoff(d: date) -> datetime:
    """Hora local a partir de la cual un check-in cuenta como tarde."""
    start = datetime.combine(d, parse_hhmm(settings.workday_start), tzinfo=TZ)
    return start + timedelta(minutes=settings.late_tolerance_minutes)


def is_late(checkin: datetime) -> bool:
    local = checkin.astimezone(TZ)
    return local > late_cutoff(local.date())


def to_local(dt: datetime) -> datetime:
    return dt.astimezone(TZ)


# ─── Formato para humanos (español mexicano) ─────────────────────────────────

_DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
_MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def fmt_hora(dt: datetime) -> str:
    """'8:30 am', '3:05 pm'."""
    local = to_local(dt)
    h = local.hour % 12 or 12
    return f"{h}:{local.minute:02d} {'am' if local.hour < 12 else 'pm'}"


def fmt_dia(d: date, today: date | None = None) -> str:
    """'hoy', 'ayer', 'mañana', 'vie 30 oct'."""
    today = today or local_today()
    delta = (d - today).days
    if delta == 0:
        return "hoy"
    if delta == -1:
        return "ayer"
    if delta == 1:
        return "mañana"
    return f"{_DIAS[d.weekday()]} {d.day} {_MESES[d.month - 1]}"


def fmt_cuando(dt: datetime, today: date | None = None) -> str:
    """'hoy 8:30 am', 'ayer 6:10 pm', 'vie 30 oct 4:15 pm'."""
    return f"{fmt_dia(to_local(dt).date(), today)} {fmt_hora(dt)}"
