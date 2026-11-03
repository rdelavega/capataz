"""
Lo que el dueño necesita saber, calculado en un solo lugar: pendientes que
requieren su atención, métricas con tendencia y el historial de cada
trabajador. Lo usan el dashboard, la ficha del trabajador y el resumen diario
por WhatsApp, así que todos cuentan lo mismo.

Las empresas son chicas (decenas de trabajadores), así que se carga lo
necesario en memoria y se calcula en Python: más fácil de leer y de probar que
SQL con ventanas.
"""
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceDaily
from app.models.branch import Branch
from app.models.crew import Crew
from app.models.event import Event
from app.models.job import Job
from app.models.notification import Notification
from app.models.worker import Worker
from app.timeutil import (
    TZ, fmt_cuando, fmt_dia, fmt_hora, is_rest_day, late_cutoff, local_date, local_now, to_local,
)

OPEN_STATUSES = ("pendiente", "en_progreso", "atrasado")
HISTORY_DAYS = 30
SERIES_DAYS = 14
LATE_STREAK_THRESHOLD = 3       # llegadas tarde en 7 días para avisar
NO_PHOTOS_AFTER = time(12, 0)   # una obra con gente y sin fotos a esta hora es un pendiente


# ─── Reglas puras ─────────────────────────────────────────────────────────────

def job_is_overdue(job: Job, today: date) -> bool:
    if job.status == "atrasado":
        return True
    return job.status in ("pendiente", "en_progreso") and job.due_date is not None and job.due_date < today


def job_closed_at(job: Job) -> datetime | None:
    """Cuándo se cerró (aprobó) la tarea. Tareas viejas sin approved_at usan updated_at."""
    if job.status != "completado":
        return None
    return job.approved_at or job.updated_at


def day_code(rec: AttendanceDaily | None, d: date, today: date, start: date) -> str:
    """
    p = a tiempo · t = tarde · f = faltó · d = descanso · n = hoy, sin reporte aún
    - = todavía no trabajaba aquí
    """
    if d < start:
        return "-"
    if rec is not None:
        return {"presente": "p", "tarde": "t", "ausente": "f"}.get(rec.status, "p")
    if is_rest_day(d):
        return "d"
    if d == today:
        return "n"
    return "f"


def attendance_pct(codes: list[str]) -> int | None:
    worked = sum(1 for c in codes if c in "pt")
    expected = sum(1 for c in codes if c in "ptf")
    return round(100 * worked / expected) if expected else None


def _date_range(end: date, days: int) -> list[date]:
    return [end - timedelta(days=days - 1 - i) for i in range(days)]


# ─── Carga de datos ───────────────────────────────────────────────────────────

@dataclass
class Snapshot:
    today: date
    now: datetime
    branches: dict[uuid.UUID, Branch]
    workers: list[Worker]                                   # activos
    attendance: dict[uuid.UUID, dict[date, AttendanceDaily]]
    jobs: list[Job]
    photos_by_job: dict[uuid.UUID, list[Event]]
    events_today: list[Event]
    last_event: dict[uuid.UUID, Event]
    crews: dict[uuid.UUID, Crew] = field(default_factory=dict)
    reminders_today: dict[tuple[str, uuid.UUID | None], datetime] = field(default_factory=dict)

    def worker_start(self, w: Worker) -> date:
        return to_local(w.created_at).date() if w.created_at else self.today - timedelta(days=365)

    def worker(self, wid: uuid.UUID | None) -> Worker | None:
        return next((w for w in self.workers if w.id == wid), None) if wid else None

    def contact(self, j: Job) -> Worker | None:
        """Con quién habla el bot sobre un trabajo: la persona asignada o el encargado de la cuadrilla."""
        if j.worker_id:
            return self.worker(j.worker_id)
        crew = self.crews.get(j.crew_id) if j.crew_id else None
        return self.worker(crew.lead_worker_id) if crew else None

    def who(self, j: Job) -> str:
        """'Luis Pech', 'Cuadrilla Norte (enc. Jorge Canché)' o 'Sin asignar'."""
        if j.worker_id and (w := self.worker(j.worker_id)):
            return w.name
        crew = self.crews.get(j.crew_id) if j.crew_id else None
        if crew:
            lead = self.worker(crew.lead_worker_id)
            return f"{crew.name} (enc. {lead.name})" if lead else crew.name
        return "Sin asignar"

    def jobs_of(self, w: Worker) -> list[Job]:
        """Trabajos de una persona: los suyos y los de su cuadrilla sin persona asignada."""
        return [
            j for j in self.jobs
            if j.worker_id == w.id or (w.crew_id and j.crew_id == w.crew_id and not j.worker_id)
        ]

    def codes(self, w: Worker, days: list[date]) -> list[str]:
        recs = self.attendance.get(w.id, {})
        start = self.worker_start(w)
        return [day_code(recs.get(d), d, self.today, start) for d in days]


async def load_snapshot(session: AsyncSession, company_id: uuid.UUID) -> Snapshot:
    now = local_now()
    today = now.date()
    since = today - timedelta(days=HISTORY_DAYS + SERIES_DAYS)

    branches = {
        b.id: b for b in (await session.execute(
            select(Branch).where(Branch.company_id == company_id)
        )).scalars()
    }
    workers = list((await session.execute(
        select(Worker).where(Worker.company_id == company_id, Worker.active.is_(True)).order_by(Worker.name)
    )).scalars())

    attendance: dict[uuid.UUID, dict[date, AttendanceDaily]] = defaultdict(dict)
    for a in (await session.execute(
        select(AttendanceDaily).where(
            AttendanceDaily.company_id == company_id, AttendanceDaily.work_date >= since,
        )
    )).scalars():
        attendance[a.worker_id][a.work_date] = a

    jobs = list((await session.execute(select(Job).where(Job.company_id == company_id))).scalars())
    crews = {
        c.id: c for c in (await session.execute(select(Crew).where(Crew.company_id == company_id))).scalars()
    }

    photos_by_job: dict[uuid.UUID, list[Event]] = defaultdict(list)
    for e in (await session.execute(
        select(Event).where(
            Event.company_id == company_id, Event.job_id.is_not(None), Event.event_type == "photo",
        ).order_by(Event.received_at)
    )).scalars():
        photos_by_job[e.job_id].append(e)

    events_today = list((await session.execute(
        select(Event).where(
            Event.company_id == company_id, local_date(Event.received_at) == today,
            Event.worker_id.is_not(None),
        ).order_by(Event.received_at.desc())
    )).scalars())

    last_event: dict[uuid.UUID, Event] = {}
    for e in (await session.execute(
        select(Event).distinct(Event.worker_id).where(
            Event.company_id == company_id, Event.worker_id.is_not(None),
        ).order_by(Event.worker_id, Event.received_at.desc())
    )).scalars():
        last_event[e.worker_id] = e

    reminders: dict[tuple[str, uuid.UUID | None], datetime] = {}
    for n in (await session.execute(
        select(Notification).where(
            Notification.company_id == company_id, Notification.ok.is_(True),
            local_date(Notification.sent_at) == today,
        )
    )).scalars():
        key_id = n.job_id if n.kind == "job_progress" else n.worker_id
        reminders[(n.kind, key_id)] = n.sent_at

    return Snapshot(
        today=today, now=now, branches=branches, workers=workers, attendance=attendance,
        jobs=jobs, photos_by_job=photos_by_job, events_today=events_today,
        last_event=last_event, crews=crews, reminders_today=reminders,
    )


# ─── Necesita tu atención ─────────────────────────────────────────────────────

SEVERITY_ORDER = {"urgent": 0, "review": 1, "warn": 2}


def attention_items(s: Snapshot) -> list[dict]:
    items: list[dict] = []
    branch_name = lambda bid: s.branches[bid].name if bid in s.branches else "Sin sucursal"  # noqa: E731

    # 1. No ha llegado / avisó que no viene
    if not is_rest_day(s.today) and s.now >= late_cutoff(s.today):
        for w in s.workers:
            if s.worker_start(w) > s.today:
                continue
            rec = s.attendance.get(w.id, {}).get(s.today)
            if rec is None:
                last = s.last_event.get(w.id)
                detail = [branch_name(w.branch_id)]
                detail.append(f"último contacto {fmt_cuando(last.received_at, s.today)}" if last else "nunca ha escrito")
                asked = s.reminders_today.get(("checkin_reminder", w.id))
                if asked:
                    detail.append(f"el bot le preguntó a las {fmt_hora(asked)}")
                items.append({
                    "id": f"no_llego:{w.id}", "severity": "urgent", "kind": "no_llego",
                    "title": f"{w.name} no ha llegado", "detail": " · ".join(detail),
                    "worker_id": str(w.id), "worker_name": w.name, "phone_number": w.phone_number,
                    "action": "whatsapp",
                })
            elif rec.status == "ausente":
                items.append({
                    "id": f"ausente:{w.id}", "severity": "warn", "kind": "ausente",
                    "title": f"{w.name} avisó que hoy no viene", "detail": branch_name(w.branch_id),
                    "worker_id": str(w.id), "worker_name": w.name, "phone_number": w.phone_number,
                    "action": "worker",
                })

    # 2. Tareas atrasadas y que vencen hoy sin foto
    for j in s.jobs:
        w = s.contact(j)
        photos = s.photos_by_job.get(j.id, [])
        who = s.who(j)
        if job_is_overdue(j, s.today):
            detail = [who, branch_name(j.branch_id), f"{len(photos)} foto{'s' if len(photos) != 1 else ''}"]
            asked = s.reminders_today.get(("job_progress", j.id))
            if asked:
                detail.append(f"el bot le preguntó a las {fmt_hora(asked)}")
            vence = f"venció {fmt_dia(j.due_date, s.today)}" if j.due_date else "marcada con problema"
            items.append({
                "id": f"atrasada:{j.id}", "severity": "urgent", "kind": "tarea_atrasada",
                "title": f"{j.title}: {vence}", "detail": " · ".join(detail),
                "job_id": str(j.id), "worker_id": str(w.id) if w else None,
                "worker_name": w.name if w else None, "phone_number": w.phone_number if w else None,
                "action": "whatsapp" if w else "tasks",
            })
        elif j.status in ("pendiente", "en_progreso") and j.due_date == s.today:
            photo_today = any(to_local(p.received_at).date() == s.today for p in photos)
            if not photo_today:
                items.append({
                    "id": f"vence_hoy:{j.id}", "severity": "warn", "kind": "vence_hoy",
                    "title": f"{j.title} vence hoy y no hay foto de avance",
                    "detail": f"{who} · {branch_name(j.branch_id)}",
                    "job_id": str(j.id), "worker_id": str(w.id) if w else None,
                    "worker_name": w.name if w else None, "phone_number": w.phone_number if w else None,
                    "action": "whatsapp" if w else "tasks",
                })

    # 3. Por revisar (un solo renglón con todas)
    review = sorted((j for j in s.jobs if j.status == "por_revisar"),
                    key=lambda j: j.completed_at or j.updated_at)
    if review:
        parts = []
        for j in review[:3]:
            when = fmt_hora(j.completed_at) if j.completed_at else ""
            parts.append(f"{j.title} ({s.who(j)}{', ' + when if when else ''})")
        if len(review) > 3:
            parts.append(f"y {len(review) - 3} más")
        n = len(review)
        items.append({
            "id": "por_revisar", "severity": "review", "kind": "por_revisar",
            "title": f"{n} tarea{'s' if n != 1 else ''} terminada{'s' if n != 1 else ''} "
                     f"espera{'n' if n != 1 else ''} tu visto bueno",
            "detail": " · ".join(parts), "action": "review", "count": n,
        })

    # 4. Llega tarde seguido
    week = _date_range(s.today, 7)
    for w in s.workers:
        recs = s.attendance.get(w.id, {})
        late_days = [recs[d] for d in week if d in recs and recs[d].status == "tarde"]
        if len(late_days) >= LATE_STREAK_THRESHOLD:
            avg = _avg_time([r.checkin_at for r in late_days if r.checkin_at])
            items.append({
                "id": f"tarde:{w.id}", "severity": "warn", "kind": "tarde_repetido",
                "title": f"{w.name} llegó tarde {len(late_days)} veces esta semana",
                "detail": f"Llega en promedio a las {avg}" if avg else branch_name(w.branch_id),
                "worker_id": str(w.id), "worker_name": w.name, "phone_number": w.phone_number,
                "action": "worker",
            })

    # 5. Obra con gente pero sin fotos
    if s.now.time() >= NO_PHOTOS_AFTER and not is_rest_day(s.today):
        present_by_branch: dict[uuid.UUID, int] = defaultdict(int)
        for w in s.workers:
            rec = s.attendance.get(w.id, {}).get(s.today)
            if rec and rec.status in ("presente", "tarde") and w.branch_id:
                present_by_branch[w.branch_id] += 1
        branch_of = {w.id: w.branch_id for w in s.workers}
        branches_with_photo = {branch_of.get(e.worker_id) for e in s.events_today if e.event_type == "photo"}
        for bid, n in present_by_branch.items():
            if bid not in branches_with_photo:
                items.append({
                    "id": f"sin_fotos:{bid}", "severity": "warn", "kind": "obra_sin_fotos",
                    "title": f"{branch_name(bid)}: nadie ha mandado foto hoy",
                    "detail": f"{n} presente{'s' if n != 1 else ''}", "branch_id": str(bid), "action": "none",
                })

    items.sort(key=lambda i: SEVERITY_ORDER[i["severity"]])
    return items


def _avg_time(dts: list[datetime]) -> str | None:
    if not dts:
        return None
    minutes = sum(to_local(d).hour * 60 + to_local(d).minute for d in dts) // len(dts)
    return fmt_hora(datetime.combine(date.today(), time(minutes // 60, minutes % 60), tzinfo=TZ))


# ─── Métricas con tendencia ───────────────────────────────────────────────────

def metrics(s: Snapshot) -> dict:
    days = _date_range(s.today, SERIES_DAYS)
    prev_days = _date_range(s.today - timedelta(days=7), 7)
    week_days = _date_range(s.today, 7)

    def present_on(d: date) -> tuple[int, int, int]:
        """(presentes, a tiempo, esperados) en un día."""
        present = on_time = expected = 0
        for w in s.workers:
            if s.worker_start(w) > d:
                continue
            expected += 1
            rec = s.attendance.get(w.id, {}).get(d)
            if rec and rec.status in ("presente", "tarde"):
                present += 1
                on_time += rec.status == "presente"
        return present, on_time, expected

    attendance_series: list[int | None] = []
    on_time_series: list[int | None] = []
    for d in days:
        p, ot, e = present_on(d)
        if is_rest_day(d) or e == 0:
            attendance_series.append(None)
            on_time_series.append(None)
        else:
            attendance_series.append(round(100 * p / e))
            on_time_series.append(round(100 * ot / p) if p else None)

    def on_time_pct(ds: list[date]) -> int | None:
        p = ot = 0
        for d in ds:
            dp, dot, _ = present_on(d)
            p += dp
            ot += dot
        return round(100 * ot / p) if p else None

    closed_by_day: dict[date, int] = defaultdict(int)
    closed_week = closed_week_photo = closed_prev = 0
    for j in s.jobs:
        c = job_closed_at(j)
        if c is None:
            continue
        cd = to_local(c).date()
        closed_by_day[cd] += 1
        if cd in week_days:
            closed_week += 1
            closed_week_photo += bool(s.photos_by_job.get(j.id))
        elif cd in prev_days:
            closed_prev += 1

    def overdue_on(d: date) -> int:
        n = 0
        for j in s.jobs:
            if to_local(j.created_at).date() > d or j.due_date is None or j.due_date >= d:
                continue
            c = job_closed_at(j)
            if c is None or to_local(c).date() > d:
                n += 1
        return n

    today_present, _, today_expected = present_on(s.today)
    active = [j for j in s.jobs if j.status in (*OPEN_STATUSES, "por_revisar")]
    week_end = s.today + timedelta(days=6 - s.today.weekday())
    return {
        "days": [d.isoformat() for d in days],
        "attendance": {
            "present": today_present, "expected": today_expected,
            "rest_day": is_rest_day(s.today), "series": attendance_series,
        },
        "on_time": {
            "week_pct": on_time_pct(week_days), "prev_week_pct": on_time_pct(prev_days),
            "series": on_time_series,
        },
        "closed": {
            "week": closed_week, "week_with_photo": closed_week_photo, "prev_week": closed_prev,
            "series": [closed_by_day.get(d, 0) for d in days],
        },
        "overdue": {
            "now": sum(job_is_overdue(j, s.today) for j in s.jobs),
            "active": len(active),
            "due_this_week": sum(
                1 for j in active if j.due_date and s.today <= j.due_date <= week_end
            ),
            "series": [overdue_on(d) for d in days[:-1]] + [sum(job_is_overdue(j, s.today) for j in s.jobs)],
        },
    }


# ─── Estado por obra/sucursal ─────────────────────────────────────────────────

def branch_stats(s: Snapshot) -> list[dict]:
    week_days = set(_date_range(s.today, 7))
    branch_of = {w.id: w.branch_id for w in s.workers}
    last_photo: dict[uuid.UUID, datetime] = {}
    for e in (ev for jobs in s.photos_by_job.values() for ev in jobs):
        bid = branch_of.get(e.worker_id)
        if bid and (bid not in last_photo or e.received_at > last_photo[bid]):
            last_photo[bid] = e.received_at
    for e in s.events_today:
        if e.event_type == "photo":
            bid = branch_of.get(e.worker_id)
            if bid and (bid not in last_photo or e.received_at > last_photo[bid]):
                last_photo[bid] = e.received_at

    out = []
    for bid, b in sorted(s.branches.items(), key=lambda kv: kv[1].name):
        ws = [w for w in s.workers if w.branch_id == bid and s.worker_start(w) <= s.today]
        present = sum(
            1 for w in ws
            if (r := s.attendance.get(w.id, {}).get(s.today)) and r.status in ("presente", "tarde")
        )
        bjobs = [j for j in s.jobs if j.branch_id == bid]
        open_jobs = [j for j in bjobs if j.status in (*OPEN_STATUSES, "por_revisar")]
        done_week = [j for j in bjobs if (c := job_closed_at(j)) and to_local(c).date() in week_days]
        overdue = sum(job_is_overdue(j, s.today) for j in bjobs)
        review = sum(j.status == "por_revisar" for j in bjobs)
        photo_at = last_photo.get(bid)
        photo_today = photo_at is not None and to_local(photo_at).date() == s.today

        if overdue or (ws and present == 0 and not is_rest_day(s.today) and s.now >= late_cutoff(s.today)):
            semaforo, reason = "rojo", "Atrasada" if overdue else "Nadie ha llegado"
        elif present < len(ws) and s.now >= late_cutoff(s.today) and not is_rest_day(s.today):
            semaforo, reason = "amarillo", "Falta gente"
        elif present and not photo_today and s.now.time() >= NO_PHOTOS_AFTER:
            semaforo, reason = "amarillo", "Sin fotos"
        else:
            semaforo, reason = "verde", "Al día"

        out.append({
            "id": str(bid), "name": b.name, "semaforo": semaforo, "reason": reason,
            "present": present, "expected": len(ws),
            "jobs_done_week": len(done_week), "jobs_open": len(open_jobs),
            "jobs_overdue": overdue, "jobs_review": review,
            "last_photo_at": photo_at.isoformat() if photo_at else None,
        })
    return out


# ─── Ficha del trabajador ─────────────────────────────────────────────────────

def worker_row(s: Snapshot, w: Worker) -> dict:
    """Lo que se muestra de un trabajador en listas (Equipo, panel)."""
    days = _date_range(s.today, HISTORY_DAYS)
    codes = s.codes(w, days)
    rec = s.attendance.get(w.id, {}).get(s.today)
    wjobs = s.jobs_of(w)
    last = s.last_event.get(w.id)
    crew = s.crews.get(w.crew_id) if w.crew_id else None
    return {
        "id": str(w.id), "name": w.name, "phone_number": w.phone_number, "title": w.title,
        "branch_id": str(w.branch_id) if w.branch_id else None,
        "branch_name": s.branches[w.branch_id].name if w.branch_id in s.branches else None,
        "active": w.active,
        "crew_id": str(crew.id) if crew else None,
        "crew_name": crew.name if crew else None,
        "is_lead": bool(crew and crew.lead_worker_id == w.id),
        "today_status": rec.status if rec else None,
        "checkin_at": rec.checkin_at.isoformat() if rec and rec.checkin_at else None,
        "last_event": {"type": last.event_type, "received_at": last.received_at.isoformat()} if last else None,
        "active_jobs": sum(j.status in (*OPEN_STATUSES, "por_revisar") for j in wjobs),
        "overdue_jobs": sum(job_is_overdue(j, s.today) for j in wjobs),
        "attendance_30d": codes,
        "attendance_pct": attendance_pct(codes),
        "late_week": sum(c == "t" for c in codes[-7:]),
    }


def worker_summary(s: Snapshot, w: Worker, events_today: list[Event], photos: list[Event],
                   photo_total: int) -> dict:
    days = _date_range(s.today, HISTORY_DAYS)
    codes = s.codes(w, days)
    recs = s.attendance.get(w.id, {})
    checkins = [r.checkin_at for d, r in recs.items() if d in days and r.checkin_at]
    since = s.today - timedelta(days=HISTORY_DAYS - 1)
    wjobs = s.jobs_of(w)
    done_30 = [j for j in wjobs if (c := job_closed_at(j)) and to_local(c).date() >= since]
    jobs_by_id = {j.id: j for j in wjobs}

    active_jobs = sorted(
        (j for j in wjobs if j.status in (*OPEN_STATUSES, "por_revisar")),
        key=lambda j: (j.status != "por_revisar", not job_is_overdue(j, s.today), j.due_date or date.max),
    )

    timeline = []
    for e in sorted(events_today, key=lambda e: e.received_at):
        job = jobs_by_id.get(e.job_id) if e.job_id else None
        timeline.append({
            "id": str(e.id), "type": e.event_type, "received_at": e.received_at.isoformat(),
            "text": e.transcription or e.text_content, "media_url": e.media_url,
            "job_title": job.title if job else None,
        })

    return {
        "worker": worker_row(s, w),
        "month": {
            "from": since.isoformat(), "to": s.today.isoformat(),
            "days_worked": sum(c in "pt" for c in codes),
            "days_expected": sum(c in "ptf" for c in codes),
            "days_late": sum(c == "t" for c in codes),
            "days_absent": sum(c == "f" for c in codes),
            "avg_checkin": _avg_time(checkins),
            "jobs_done": len(done_30),
            "jobs_done_with_photo": sum(bool(s.photos_by_job.get(j.id)) for j in done_30),
            "jobs_overdue": sum(job_is_overdue(j, s.today) for j in wjobs),
        },
        "calendar": [{"date": d.isoformat(), "code": c} for d, c in zip(days, codes)],
        "today": timeline,
        "jobs": [job_card(s, j) for j in active_jobs],
        "photos": [
            {"id": str(p.id), "url": p.media_url, "received_at": p.received_at.isoformat(),
             "caption": p.text_content,
             "job_title": jobs_by_id[p.job_id].title if p.job_id in jobs_by_id else None}
            for p in photos
        ],
        "photo_total": photo_total,
    }


def job_card(s: Snapshot, j: Job) -> dict:
    photos = s.photos_by_job.get(j.id, [])
    asked = s.reminders_today.get(("job_progress", j.id))
    contact = s.contact(j)
    crew = s.crews.get(j.crew_id) if j.crew_id else None
    return {
        "id": str(j.id), "title": j.title, "status": j.status,
        "crew_id": str(crew.id) if crew else None,
        "crew_name": crew.name if crew else None,
        "assignee": s.who(j),
        "contact_id": str(contact.id) if contact else None,
        "contact_name": contact.name if contact else None,
        "contact_phone": contact.phone_number if contact else None,
        "due_date": j.due_date.isoformat() if j.due_date else None,
        "overdue": job_is_overdue(j, s.today),
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
        "acknowledged_at": j.acknowledged_at.isoformat() if j.acknowledged_at else None,
        "photo_count": len(photos),
        "last_photo_at": photos[-1].received_at.isoformat() if photos else None,
        "bot_asked_at": asked.isoformat() if asked else None,
    }
