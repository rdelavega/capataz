import uuid
from datetime import date, datetime, timedelta

from app.models.attendance import AttendanceDaily
from app.models.branch import Branch
from app.models.event import Event
from app.models.job import Job
from app.models.worker import Worker
from app.services import insights, notify, scheduler
from app.services.whatsapp import build_template_payload
from app.timeutil import TZ

# Lunes 2 nov 2026, 10:42 am en Mérida
TODAY = date(2026, 11, 2)
NOW = datetime(2026, 11, 2, 10, 42, tzinfo=TZ)
LONG_AGO = datetime(2026, 9, 1, 9, 0, tzinfo=TZ)

OBRA = Branch(id=uuid.uuid4(), name="Altabrisa")


def _worker(name: str) -> Worker:
    return Worker(id=uuid.uuid4(), name=name, phone_number="+5219990000000", branch_id=OBRA.id,
                  active=True, created_at=LONG_AGO)


def _att(w: Worker, d: date, status: str, hh: int = 7, mm: int = 45) -> AttendanceDaily:
    return AttendanceDaily(worker_id=w.id, work_date=d, status=status,
                           checkin_at=datetime.combine(d, datetime.min.time(), tzinfo=TZ).replace(hour=hh, minute=mm))


def _job(title: str, w: Worker | None, status: str, due: date | None, **kw) -> Job:
    return Job(id=uuid.uuid4(), title=title, worker_id=w.id if w else None, branch_id=OBRA.id,
               status=status, due_date=due, created_at=LONG_AGO, updated_at=LONG_AGO, **kw)


def _snap(workers, attendance=(), jobs=(), photos=(), events_today=(), now=NOW) -> insights.Snapshot:
    att: dict = {}
    for a in attendance:
        att.setdefault(a.worker_id, {})[a.work_date] = a
    by_job: dict = {}
    for p in photos:
        by_job.setdefault(p.job_id, []).append(p)
    return insights.Snapshot(
        today=now.date(), now=now, branches={OBRA.id: OBRA}, workers=list(workers), attendance=att,
        jobs=list(jobs), photos_by_job=by_job, events_today=list(events_today), last_event={},
    )


def test_day_codes() -> None:
    start = date(2026, 10, 1)
    assert insights.day_code(None, date(2026, 11, 1), TODAY, start) == "d"   # domingo
    assert insights.day_code(None, date(2026, 10, 30), TODAY, start) == "f"
    assert insights.day_code(None, TODAY, TODAY, start) == "n"
    assert insights.day_code(None, date(2026, 9, 1), TODAY, start) == "-"
    assert insights.attendance_pct(["p", "t", "f", "d", "n"]) == 67


def test_attention_no_llego_y_ordenado_por_urgencia() -> None:
    pedro, luis = _worker("Pedro May"), _worker("Luis Pech")
    review = _job("Colado de losa", luis, "por_revisar", TODAY, completed_at=NOW - timedelta(minutes=30))
    items = insights.attention_items(_snap([pedro, luis], [_att(luis, TODAY, "presente")], [review]))
    kinds = [i["kind"] for i in items]
    assert kinds[0] == "no_llego" and items[0]["worker_name"] == "Pedro May"
    assert "por_revisar" in kinds
    assert kinds.index("no_llego") < kinds.index("por_revisar")


def test_attention_no_avisa_antes_de_la_hora_de_entrada() -> None:
    pedro = _worker("Pedro May")
    early = datetime(2026, 11, 2, 8, 5, tzinfo=TZ)
    assert insights.attention_items(_snap([pedro], now=early)) == []


def test_attention_tarea_atrasada_y_vence_hoy_sin_foto() -> None:
    w = _worker("Pedro May")
    late = _job("Impermeabilización", w, "en_progreso", TODAY - timedelta(days=1))
    today = _job("Firme de cochera", w, "pendiente", TODAY)
    items = insights.attention_items(_snap([w], [_att(w, TODAY, "presente")], [late, today]))
    by_kind = {i["kind"]: i for i in items}
    assert "venció ayer" in by_kind["tarea_atrasada"]["title"]
    assert by_kind["vence_hoy"]["severity"] == "warn"


def test_attention_tarde_repetido() -> None:
    w = _worker("Jorge Canul")
    att = [_att(w, TODAY - timedelta(days=d), "tarde", 8, 24) for d in (0, 1, 2)]
    items = insights.attention_items(_snap([w], att))
    assert any(i["kind"] == "tarde_repetido" and "8:24 am" in i["detail"] for i in items)


def test_attention_obra_sin_fotos_despues_de_mediodia() -> None:
    w = _worker("Manuel Uc")
    afternoon = datetime(2026, 11, 2, 13, 0, tzinfo=TZ)
    items = insights.attention_items(_snap([w], [_att(w, TODAY, "presente")], now=afternoon))
    assert [i["kind"] for i in items] == ["obra_sin_fotos"]


def test_metrics_cuenta_cerradas_con_foto() -> None:
    w = _worker("Ana Chi")
    done = _job("Demolición", w, "completado", TODAY, approved_at=NOW - timedelta(days=1))
    photo = Event(id=uuid.uuid4(), job_id=done.id, worker_id=w.id, event_type="photo",
                  received_at=NOW - timedelta(days=1))
    m = insights.metrics(_snap([w], [_att(w, TODAY, "presente")], [done], [photo]))
    assert m["closed"]["week"] == 1 and m["closed"]["week_with_photo"] == 1
    assert m["attendance"]["present"] == 1 and m["attendance"]["expected"] == 1
    assert len(m["days"]) == 14 and m["attendance"]["series"][-2] is None  # ayer domingo


def test_branch_semaforo_rojo_si_hay_atrasadas() -> None:
    w = _worker("Pedro May")
    late = _job("Impermeabilización", w, "atrasado", None)
    [b] = insights.branch_stats(_snap([w], [_att(w, TODAY, "presente")], [late]))
    assert b["semaforo"] == "rojo" and b["jobs_overdue"] == 1


def test_resumen_diario_params_sin_saltos_de_linea() -> None:
    a, b = _worker("Luis Pech"), _worker("Pedro May")
    params = notify.summary_params(_snap([a, b], [_att(a, TODAY, "presente")]))
    assert params[1:4] == ["1", "2", "Pedro May"]
    assert all("\n" not in p for p in params)


def test_template_payload_limpia_parametros_y_botones() -> None:
    p = build_template_payload("+521999", "capataz_avance", ["Luis", "Losa\n2º piso"], ["completado::1"])
    body, button = p["template"]["components"]
    assert body["parameters"][1]["text"] == "Losa 2º piso"
    assert button["parameters"][0]["payload"] == "completado::1"


def test_scheduler_solo_con_plantilla_y_en_su_ventana(monkeypatch) -> None:
    monkeypatch.setattr(scheduler.settings, "wa_template_checkin_reminder", "capataz_llegada")
    monkeypatch.setattr(scheduler.settings, "wa_template_daily_summary", "")
    at_830 = datetime(2026, 11, 2, 8, 31, tzinfo=TZ)
    assert [k for k, _ in scheduler.due_jobs(at_830)] == ["checkin_reminder"]
    assert scheduler.due_jobs(datetime(2026, 11, 2, 11, 0, tzinfo=TZ)) == []      # pasó la ventana
    assert scheduler.due_jobs(datetime(2026, 11, 1, 8, 31, tzinfo=TZ)) == []       # domingo


# ─── Ventana de 24 h: sin plantilla si el trabajador ya escribió ─────────────

import asyncio  # noqa: E402
from unittest.mock import AsyncMock  # noqa: E402

import pytest  # noqa: E402


class _Session:
    def __init__(self):
        self.added = []

    def add(self, o):
        self.added.append(o)

    async def flush(self):
        pass


def _wa(monkeypatch):
    sent = {"template": AsyncMock(), "buttons": AsyncMock()}
    monkeypatch.setattr(notify.whatsapp, "send_template", sent["template"])
    monkeypatch.setattr(notify.whatsapp, "send_interactive_buttons", sent["buttons"])
    return sent


def test_job_progress_usa_botones_si_la_ventana_esta_abierta(monkeypatch) -> None:
    sent = _wa(monkeypatch)
    monkeypatch.setattr(notify, "window_open", AsyncMock(return_value=True))
    monkeypatch.setattr(notify.settings, "wa_template_job_progress", "capataz_estado_tarea")
    w = _worker("Luis Pech")
    asyncio.run(notify.job_progress(_Session(), uuid.uuid4(), _job("Losa", w, "en_progreso", TODAY), w, TODAY))
    sent["buttons"].assert_awaited_once()
    sent["template"].assert_not_awaited()


def test_job_progress_usa_plantilla_si_no_ha_escrito(monkeypatch) -> None:
    sent = _wa(monkeypatch)
    monkeypatch.setattr(notify, "window_open", AsyncMock(return_value=False))
    monkeypatch.setattr(notify.settings, "wa_template_job_progress", "capataz_estado_tarea")
    w = _worker("Luis Pech")
    asyncio.run(notify.job_progress(_Session(), uuid.uuid4(), _job("Losa", w, "en_progreso", TODAY), w, TODAY))
    sent["template"].assert_awaited_once()


def test_sin_ventana_ni_plantilla_no_manda_nada(monkeypatch) -> None:
    sent = _wa(monkeypatch)
    monkeypatch.setattr(notify, "window_open", AsyncMock(return_value=False))
    monkeypatch.setattr(notify.settings, "wa_template_checkin_reminder", "")
    session = _Session()
    with pytest.raises(notify.NoWindow):
        asyncio.run(notify.checkin_reminder(session, uuid.uuid4(), _worker("Luis Pech")))
    assert not session.added
    sent["template"].assert_not_awaited()
    sent["buttons"].assert_not_awaited()


def test_scheduler_resumen_solo_con_plantilla(monkeypatch) -> None:
    monkeypatch.setattr(scheduler.settings, "wa_template_daily_summary", "")
    at_6pm = datetime(2026, 11, 2, 18, 1, tzinfo=TZ)
    assert scheduler.due_jobs(at_6pm) == []
    monkeypatch.setattr(scheduler.settings, "wa_template_daily_summary", "capataz_resumen_diario")
    assert [k for k, _ in scheduler.due_jobs(at_6pm)] == ["daily_summary"]


# ─── SECRET_KEY obligatoria en producción ─────────────────────────────────────

def test_secret_key_por_defecto_no_arranca_en_railway(monkeypatch) -> None:
    from app.config import DEV_SECRET_KEY, Settings
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "production")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(secret_key=DEV_SECRET_KEY)
    assert Settings(secret_key="x" * 48).secret_key == "x" * 48
    assert Settings(secret_key="corta").secret_key == "corta"  # solo avisa


def test_secret_key_por_defecto_permitida_en_local(monkeypatch) -> None:
    from app.config import Settings
    for k in [k for k in __import__("os").environ if k.startswith("RAILWAY_ENVIRONMENT")]:
        monkeypatch.delenv(k)
    assert Settings().secret_key


# ─── Cuadrillas ───────────────────────────────────────────────────────────────

from app.models.crew import Crew  # noqa: E402


def test_trabajo_de_cuadrilla_habla_con_el_encargado() -> None:
    jorge, luis = _worker("Jorge Canché"), _worker("Luis Pech")
    crew = Crew(id=uuid.uuid4(), name="Albañiles", lead_worker_id=jorge.id)
    jorge.crew_id = luis.crew_id = crew.id
    job = _job("Colado de losa", None, "en_progreso", TODAY - timedelta(days=1), crew_id=crew.id)
    s = _snap([jorge, luis], [_att(jorge, TODAY, "presente"), _att(luis, TODAY, "presente")], [job])
    s.crews = {crew.id: crew}
    assert s.contact(job) is jorge
    assert s.who(job) == "Albañiles (enc. Jorge Canché)"
    assert job in s.jobs_of(luis)  # el trabajo de la cuadrilla aparece en la ficha de cada integrante
    item = next(i for i in insights.attention_items(s) if i["kind"] == "tarea_atrasada")
    assert item["worker_name"] == "Jorge Canché" and "Albañiles" in item["detail"]


def test_aviso_de_trabajo_nuevo_con_ventana_lleva_detalles_y_botones(monkeypatch) -> None:
    sent = _wa(monkeypatch)
    monkeypatch.setattr(notify, "window_open", AsyncMock(return_value=True))
    w = _worker("Jorge Canché")
    job = _job("Fumigar casa García", None, "pendiente", TODAY + timedelta(days=1), description="Calle 60 #123")
    asyncio.run(notify.job_assigned(_Session(), uuid.uuid4(), job, w, TODAY, crew_name="Cuadrilla Norte"))
    body, buttons = sent["buttons"].await_args.args[1:3]
    assert "Cuadrilla Norte" in body and "Calle 60 #123" in body and "mañana" in body
    assert [b["reply"]["id"].split("::")[0] for b in buttons] == ["visto", "completado", "atrasado"]


def test_aviso_de_trabajo_nuevo_sin_ventana_usa_plantilla(monkeypatch) -> None:
    sent = _wa(monkeypatch)
    monkeypatch.setattr(notify, "window_open", AsyncMock(return_value=False))
    monkeypatch.setattr(notify.settings, "wa_template_job_assigned", "capataz_trabajo_asignado")
    w = _worker("Jorge Canché")
    job = _job("Fumigar casa García", None, "pendiente", None)
    asyncio.run(notify.job_assigned(_Session(), uuid.uuid4(), job, w, TODAY))
    _, name, params = sent["template"].await_args.args[:3]
    assert name == "capataz_trabajo_asignado"
    assert params == ["Jorge", "Fumigar casa García", "sin fecha", "sin detalles"]


# ─── Verificación de presencia ────────────────────────────────────────────────

def test_lejos_de_obra_es_pendiente_y_no_trae_coordenadas() -> None:
    luis = _worker("Luis Pech")
    att = _att(luis, TODAY, "presente")
    att.location_status, att.location_distance_m, att.location_branch_id = "lejos", 2345, OBRA.id
    s = _snap([luis], attendance=[att])
    item = next(i for i in insights.attention_items(s) if i["kind"] == "lejos_de_obra")
    assert item["title"] == "Luis Pech checó a 2.3 km de Altabrisa"
    loc = insights.worker_row(s, luis)["location"]
    assert loc == {"status": "lejos", "label": "A 2.3 km de Altabrisa", "distance_m": 2345, "branch_name": "Altabrisa"}


def test_presente_sin_ubicacion() -> None:
    luis = _worker("Luis Pech")
    s = _snap([luis], attendance=[_att(luis, TODAY, "presente")])
    assert insights.worker_row(s, luis)["location"]["label"] == "Sin ubicación"


def test_foto_repetida_es_pendiente_con_la_original() -> None:
    luis, raul = _worker("Luis Pech"), _worker("Raúl Dzib")
    orig_id = uuid.uuid4()
    foto = Event(id=uuid.uuid4(), worker_id=luis.id, event_type="photo", duplicate_of_id=orig_id,
                 received_at=NOW, media_url="https://r2/b.jpg")
    s = _snap([luis, raul], attendance=[_att(luis, TODAY, "presente")], events_today=[foto])
    s.originals = {orig_id: {"id": str(orig_id), "url": "https://r2/a.jpg",
                             "received_at": datetime(2026, 10, 30, 9, 20, tzinfo=TZ).isoformat(),
                             "worker_name": "Raúl Dzib"}}
    item = next(i for i in insights.attention_items(s) if i["kind"] == "foto_repetida")
    assert item["worker_id"] == str(luis.id)
    assert "de Raúl Dzib (vie 30 oct 9:20 am)" in item["detail"]


def test_borrado_de_ubicaciones_corre_tambien_en_domingo() -> None:
    domingo = datetime(2026, 11, 1, 3, 31, tzinfo=TZ)
    assert [k for k, _ in scheduler.due_jobs(domingo)] == ["location_purge"]
