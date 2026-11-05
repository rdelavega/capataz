"""
Arma un día de trabajo creíble para una demo, según el giro del prospecto.

El tablero cuenta una historia: una sucursal en rojo (tarea atrasada), otra en
amarillo (alguien no ha llegado), uno que llega tarde seguido, una tarea
terminada esperando visto bueno con su foto, fotos con avance y un audio
transcrito. Además arma 30 días de historial (asistencia y tareas cerradas con
foto) para que las métricas, el calendario y la ficha no salgan vacíos. Si pasas --mi-numero, ese trabajador es el que falta: mandas
"presente" en vivo durante la demo y el tablero cambia frente al cliente.

Verificación de presencia: las obras tienen ubicación, casi todos checaron "en
obra", uno checó a 2.4 km y otro sin mandar ubicación. Con --fotos, una foto de
hoy es copia de una de días pasados y sale como "repetida".

BORRA sucursales, trabajadores, tareas y eventos de la empresa configurada en
COMPANY_ID antes de crear los nuevos.

Uso (desde backend/):
    python seed_demo.py --giro construccion --empresa "Constructora Pech" \\
        --mi-numero "999 123 4567" --fotos ~/demo_fotos
"""
import argparse
import asyncio
import mimetypes
import uuid
from datetime import datetime, time, timedelta
from pathlib import Path

from sqlalchemy import delete

from app import geo
from app.config import settings
from app.db import AsyncSessionLocal, engine
from app.models import AttendanceDaily, Branch, Company, Crew, Event, Job, Notification, Worker
from app.phone import normalize_phone
from app.services import storage
from app.timeutil import TZ, is_late, is_rest_day, late_cutoff, local_now, local_today

# Cada giro: 2 sucursales, 8 trabajadores (nombre, puesto, índice de sucursal),
# tareas (título, índice de trabajador, estado, días para entrega),
# fotos (índice de trabajador, índice de tarea, caption) y un audio.
GIROS: dict[str, dict] = {
    "construccion": {
        "branches": ["Obra Altabrisa — Torre B", "Obra Cholul — Casa Muestra"],
        # (nombre, obra o None si se mueve entre obras, encargado, integrantes)
        "crews": [
            ("Albañiles Altabrisa", 0, 0, [0, 1, 2]),
            ("Instalaciones", None, 3, [3, 5]),
            ("Cuadrilla Cholul", 1, 7, [4, 6, 7]),
        ],
        "workers": [
            ("Jorge Canché", "Maestro de obra", 0),
            ("Luis Pech", "Albañil", 0),
            ("Manuel Chan", "Albañil", 0),
            ("Ricardo Euán", "Electricista", 0),
            ("Gabriel May", "Residente de obra", 1),
            ("Raúl Dzib", "Plomero", 1),
            ("Fernando Ku", "Ayudante general", 1),
            ("Ángel Couoh", "Fierrero", 1),
        ],
        "jobs": [
            ("Colado de losa nivel 3", 0, "en_progreso", -1),
            ("Cableado de departamentos 301-304", 3, "en_progreso", 2),
            ("Levantar muros de baño", 1, "por_revisar", 0),
            ("Instalación hidráulica cocina", 5, "en_progreso", 1),
            ("Armado de castillos fachada", 7, "pendiente", 3),
        ],
        "photos": [
            (0, 0, "Así va la losa, falta la cimbra del lado norte"),
            (1, 2, "Muros de baño terminados"),
            (5, 3, "Tubería de cocina lista para prueba"),
        ],
        "audio": (4, "Jefe, no llegó el camión de cemento, dicen que hasta mañana. "
                     "Mientras avanzamos con la tubería."),
        "text": (2, "Ocupamos 20 bultos más de mortero"),
    },
    "taller": {
        "branches": ["Taller Matriz — Av. Itzáes", "Taller Norte — Montebello"],
        "workers": [
            ("Jorge Canché", "Jefe de taller", 0),
            ("Luis Pech", "Mecánico", 0),
            ("Manuel Chan", "Mecánico", 0),
            ("Ricardo Euán", "Hojalatero", 0),
            ("Gabriel May", "Encargado de sucursal", 1),
            ("Raúl Dzib", "Electromecánico", 1),
            ("Fernando Ku", "Ayudante", 1),
            ("Ángel Couoh", "Pintor", 1),
        ],
        "jobs": [
            ("Afinación Nissan NP300 — cliente Gómez", 1, "en_progreso", -1),
            ("Cambio de clutch Aveo 2018", 2, "en_progreso", 1),
            ("Enderezado puerta Versa", 3, "por_revisar", 0),
            ("Diagnóstico eléctrico Hilux", 5, "en_progreso", 0),
            ("Pintura defensa March", 7, "pendiente", 2),
        ],
        "photos": [
            (1, 0, "Ya desarmé, el cuerpo de aceleración viene muy sucio"),
            (3, 2, "Puerta lista para entregar"),
            (5, 3, "Este es el arnés que estaba en corto"),
        ],
        "audio": (4, "Jefe, la pieza del clutch no la tiene la refaccionaria, "
                     "la piden al centro, llega en la tarde."),
        "text": (2, "El cliente del Aveo pregunta si queda hoy"),
    },
    "distribuidora": {
        "branches": ["Ruta Centro — Mérida", "Ruta Oriente — Kanasín"],
        "workers": [
            ("Jorge Canché", "Supervisor de ruta", 0),
            ("Luis Pech", "Repartidor", 0),
            ("Manuel Chan", "Repartidor", 0),
            ("Rosa Euán", "Vendedora", 0),
            ("Gabriel May", "Supervisor de ruta", 1),
            ("Raúl Dzib", "Chofer", 1),
            ("Fernando Ku", "Ayudante de reparto", 1),
            ("Mariana Couoh", "Vendedora", 1),
        ],
        "jobs": [
            ("Entrega Abarrotes Doña Mary (12 cajas)", 1, "en_progreso", -1),
            ("Ruta mercado Lucas de Gálvez", 2, "en_progreso", 0),
            ("Cobranza tiendas Centro", 3, "por_revisar", 0),
            ("Entrega Súper Kanasín", 5, "en_progreso", 0),
            ("Levantar pedido tiendas nuevas", 7, "pendiente", 2),
        ],
        "photos": [
            (1, 0, "Tienda cerrada, regreso en la tarde"),
            (3, 2, "Comprobante de pago tienda El Faisán"),
            (5, 3, "Mercancía entregada y firmada"),
        ],
        "audio": (4, "Jefe, la camioneta 3 trae la llanta baja, la llevo a la "
                     "vulka y sigo con la ruta."),
        "text": (2, "Faltaron 3 cajas de refresco en la carga"),
    },
    "servicios": {
        "branches": ["Cuadrilla Norte", "Cuadrilla Sur"],
        "workers": [
            ("Jorge Canché", "Técnico líder", 0),
            ("Luis Pech", "Técnico de aires", 0),
            ("Manuel Chan", "Técnico de aires", 0),
            ("Rosa Euán", "Técnica de limpieza", 0),
            ("Gabriel May", "Técnico líder", 1),
            ("Raúl Dzib", "Técnico eléctrico", 1),
            ("Fernando Ku", "Ayudante", 1),
            ("Mariana Couoh", "Técnica de fumigación", 1),
        ],
        "jobs": [
            ("Mantenimiento 6 minisplits — Hotel Montejo", 1, "en_progreso", -1),
            ("Instalación minisplit Fracc. Las Américas", 2, "en_progreso", 0),
            ("Limpieza profunda oficinas Altabrisa", 3, "por_revisar", 0),
            ("Revisión tablero eléctrico — Plaza Sur", 5, "en_progreso", 0),
            ("Fumigación bodega Periférico", 7, "pendiente", 1),
        ],
        "photos": [
            (1, 0, "Van 4 de 6, el del cuarto 12 tiene fuga de gas"),
            (3, 2, "Oficinas terminadas"),
            (5, 3, "Así estaba el tablero antes de cambiar el breaker"),
        ],
        "audio": (4, "Jefe, el cliente de Plaza Sur no estaba, el guardia no nos "
                     "dejó pasar. Le marco en una hora."),
        "text": (2, "Me faltó gas refrigerante, paso al almacén"),
    },
}

# Hora de llegada de cada trabajador (el 6 llega tarde, el 7 no ha llegado)
CHECKINS: list[tuple[int, str] | None] = [
    (time(7, 2), "Presente"),
    (time(7, 11), "Buenos días, ya llegué"),
    (time(7, 18), "presente jefe"),
    (time(7, 34), "Presente"),
    (time(7, 5), "Buen día, presente"),
    (time(7, 41), "ya llegue"),
    (time(9, 12), "Presente, perdón se me ponchó la llanta"),
    None,
]
LATE_INDEX = 6
MISSING_INDEX = 7
FAR_INDEX = 2           # checó a ~2.4 km de su obra
NO_LOCATION_INDEX = 5   # checó sin mandar ubicación
DUPLICATE_PHOTO = 2     # esta foto de hoy es copia de una de días pasados

# Cómo le llama cada giro a sus lugares de trabajo (app/sites.py)
SITE_BY_GIRO = {"construccion": "obra", "taller": "sucursal", "distribuidora": "ruta", "servicios": "zona"}

# Dos puntos de Mérida (~7.6 km entre sí) para las obras de cualquier giro.
BRANCH_COORDS = [(21.0190, -89.6237), (21.0449, -89.5555)]
FAR_OFFSET = (0.0215, 0.0040)  # ~2.4 km al norte
HISTORY_DAYS = 30

# Tareas ya cerradas en semanas anteriores, por giro (alimentan métricas y fichas).
HISTORY_JOBS: dict[str, list[str]] = {
    "construccion": ["Cimbra de trabes nivel 2", "Limpieza de área de trabajo", "Armado de castillos",
                     "Aplanado de muros nivel 1", "Instalación de registros", "Colado de zapatas",
                     "Trazo y nivelación", "Impermeabilización cisterna"],
    "taller": ["Afinación Tsuru — cliente Pérez", "Frenos Jetta 2015", "Pintura defensa Sentra",
               "Cambio de amortiguadores Ranger", "Diagnóstico Spark", "Hojalatería cofre Aveo",
               "Alineación y balanceo Versa", "Servicio de clutch Saveiro"],
    "distribuidora": ["Entrega Abarrotes El Sol", "Cobranza ruta Oriente", "Ruta Chuburná",
                      "Entrega Mini Súper Itzimná", "Levantar pedido mercado San Benito",
                      "Entrega tiendas Caucel", "Inventario bodega", "Cobranza tiendas Kanasín"],
    "servicios": ["Mantenimiento minisplit — Clínica Norte", "Fumigación casa García",
                  "Limpieza oficinas Montejo", "Revisión eléctrica Plaza Dorada",
                  "Instalación minisplit Fracc. Altabrisa", "Limpieza de cisterna",
                  "Mantenimiento preventivo hotel", "Fumigación restaurante Centro"],
}


class DemoClock:
    """
    Horas del día de demo según la hora real en que se prepara, para que nada
    quede en el futuro y la historia siga siendo creíble:

    - Llegadas: conservan su hora. Quien todavía no "debería" haber llegado no
      aparece; el que llega tarde aparece en cuanto ya es tarde (después de la
      hora de entrada + tolerancia).
    - Actividad (fotos, audios, "terminé"): de 8:30 a 11:30, comprimida entre
      las 8:30 y la hora actual si la demo es antes de las 11:30.
    """

    ACTIVITY_START = time(8, 30)
    ACTIVITY_END = time(11, 30)

    def __init__(self, now: datetime) -> None:
        self.today = now.date()
        self.cutoff = now - timedelta(minutes=5)

    def _dt(self, t: time) -> datetime:
        return datetime.combine(self.today, t, tzinfo=TZ)

    def checkin(self, t: time, arrives_late: bool) -> datetime | None:
        at = self._dt(t)
        if at <= self.cutoff:
            return at
        if arrives_late and self.cutoff > late_cutoff(self.today):
            return self.cutoff  # acaba de llegar, ya tarde
        return None  # todavía no llega

    def activity(self, t: time) -> datetime:
        start, end = self._dt(self.ACTIVITY_START), self._dt(self.ACTIVITY_END)
        if self.cutoff >= end:
            return self._dt(t)
        w1 = self.cutoff
        w0 = min(start, w1 - timedelta(minutes=90))
        frac = min(1.0, max(0.0, (self._dt(t) - start) / (end - start)))
        return w0 + (w1 - w0) * frac


async def seed_demo(giro: str, empresa: str, mi_numero: str | None, fotos: Path | None) -> None:
    data = GIROS[giro]
    company_id = uuid.UUID(settings.company_id)
    today = local_today()

    clock = DemoClock(local_now())

    photo_files = sorted(
        p for p in (fotos.iterdir() if fotos else [])
        if _is_web_image(p)
    )
    if fotos and not photo_files:
        print(f"⚠ No encontré imágenes en {fotos}")
    if not fotos:
        print("⚠ Sin --fotos: los eventos de foto no tendrán imagen en la galería")

    async with AsyncSessionLocal() as session, session.begin():
        for model in (Notification, AttendanceDaily, Event, Job, Crew, Worker, Branch):
            await session.execute(delete(model).where(model.company_id == company_id))

        company = await session.get(Company, company_id)
        if company is None:
            raise SystemExit(f"No existe la empresa {company_id}; corre seed.py primero")
        company.name = empresa
        company.site_label = SITE_BY_GIRO[giro]

        branches = [
            Branch(company_id=company_id, name=n, latitude=BRANCH_COORDS[i % 2][0], longitude=BRANCH_COORDS[i % 2][1])
            for i, n in enumerate(data["branches"])
        ]
        session.add_all(branches)
        await session.flush()

        workers: list[Worker] = []
        for i, (name, title, b) in enumerate(data["workers"]):
            phone = f"+52199900000{i:02d}"
            if i == MISSING_INDEX and mi_numero:
                phone = normalize_phone(mi_numero)
            workers.append(Worker(
                company_id=company_id, branch_id=branches[b].id,
                name=name, title=title, phone_number=phone, active=True,
                created_at=local_now() - timedelta(days=60),
            ))
        session.add_all(workers)
        await session.flush()

        # Cuadrillas: si el giro no las define, una por sucursal con el primero como
        # encargado; en la segunda, el encargado es el que "falta" (tu número) para
        # que en la demo puedas reportar el trabajo de tu cuadrilla.
        crew_defs = data.get("crews") or [
            (f"Cuadrilla {data['branches'][b].split(' — ')[0]}", b,
             MISSING_INDEX if b == 1 else members[0], members)
            for b in range(len(branches))
            if (members := [i for i, (_, _, wb) in enumerate(data["workers"]) if wb == b])
        ]
        crew_of: dict[int, Crew] = {}
        for name, b, lead, members in crew_defs:
            crew = Crew(company_id=company_id, name=name,
                        branch_id=branches[b].id if b is not None else None)
            session.add(crew)
            await session.flush()
            crew.lead_worker_id = workers[lead].id
            for i in members:
                workers[i].crew_id = crew.id
                crew_of[i] = crew
        await session.flush()

        # Los trabajos se le mandan a la cuadrilla, no a una persona.
        jobs: list[Job] = []
        for title, w, status, days in data["jobs"]:
            crew = crew_of.get(w)
            jobs.append(Job(
                company_id=company_id, branch_id=workers[w].branch_id,
                crew_id=crew.id if crew else None,
                worker_id=None if crew else workers[w].id, title=title, status=status,
                due_date=today + timedelta(days=days),
                created_at=local_now() - timedelta(days=5),
                completed_at=clock.activity(time(10, 15)) if status == "por_revisar" else None,
            ))
        session.add_all(jobs)
        await session.flush()

        def event(worker: Worker, at: datetime, event_type: str, **fields) -> Event:
            e = Event(
                company_id=company_id, worker_id=worker.id,
                whatsapp_message_id=f"demo-{uuid.uuid4()}", raw_payload={"demo": True},
                event_type=event_type, received_at=at, **fields,
            )
            session.add(e)
            return e

        late_arrived = False
        for i, checkin in enumerate(CHECKINS):
            if checkin is None:
                continue
            t, text = checkin
            at = clock.checkin(t, arrives_late=(i == LATE_INDEX))
            if at is None:
                continue
            late_arrived |= is_late(at)
            e = event(workers[i], at, "checkin", text_content=text)
            await session.flush()
            att = AttendanceDaily(
                company_id=company_id, worker_id=workers[i].id, work_date=today,
                status="tarde" if is_late(at) else "presente",
                checkin_at=at, event_id=e.id,
            )
            session.add(att)
            if i == NO_LOCATION_INDEX:
                continue
            # Después del "presente", el botón de ubicación (igual que en el bot de verdad)
            branch = next(b for b in branches if b.id == workers[i].branch_id)
            lat, lng = branch.latitude, branch.longitude
            if i == FAR_INDEX:
                lat, lng = lat + FAR_OFFSET[0], lng + FAR_OFFSET[1]
            else:
                lat, lng = lat + 0.0003 * (i % 3), lng - 0.0002 * (i % 2)
            loc_at = at + timedelta(minutes=1)
            event(workers[i], loc_at, "location", latitude=lat, longitude=lng)
            check = geo.check_location(lat, lng, branches, branch.id)
            att.location_status, att.location_distance_m = check.status, check.distance_m
            att.location_branch_id, att.location_at = check.branch_id, loc_at

        today_photos: list[Event] = []
        for n, (w, j, caption) in enumerate(data["photos"]):
            media_url = None
            if n < len(photo_files):
                f = photo_files[n]
                key = f"media/{company_id}/demo-{giro}-{n}{f.suffix.lower()}"
                media_url = storage.upload_to_r2(f.read_bytes(), key)
            today_photos.append(event(workers[w], clock.activity(time(9 + n, 20)), "photo",
                                      job_id=jobs[j].id, text_content=caption, media_url=media_url))

        history_photos = await _seed_history(session, company_id, giro, workers, crew_of, today,
                                             [p.media_url for p in today_photos if p.media_url])

        # Una foto de hoy que es la misma que una de hace días: sale como "repetida".
        dup = today_photos[DUPLICATE_PHOTO] if DUPLICATE_PHOTO < len(today_photos) else None
        original = next((h for h in history_photos if dup and dup.media_url and h.media_url == dup.media_url), None)
        if dup and original:
            dup.duplicate_of_id = original.id

        # El bot ya le preguntó al que falta (se ve en "Necesita tu atención")
        reminder_at = datetime.combine(today, time(8, 30), tzinfo=TZ)
        if local_now() > reminder_at:
            session.add(Notification(
                company_id=company_id, kind="checkin_reminder",
                worker_id=workers[MISSING_INDEX].id, sent_at=reminder_at,
            ))

        w, transcript = data["audio"]
        event(workers[w], clock.activity(time(10, 5)), "audio",
              transcription=transcript, text_content=None)

        w, text = data["text"]
        event(workers[w], clock.activity(time(10, 48)), "text", text_content=text)

        event(workers[0], clock.activity(time(11, 30)), "location",
              latitude=21.0190, longitude=-89.6237)

    await engine.dispose()

    missing = workers[MISSING_INDEX]
    print(f"\n✓ Demo '{giro}' lista para {empresa}")
    print(f"  {len(workers)} trabajadores · {len(crew_of and set(crew_of.values()))} cuadrillas · {len(jobs)} trabajos · "
          + (f"{workers[LATE_INDEX].name} llegó tarde · " if late_arrived else "nadie ha llegado tarde aún · ")
          + f"{missing.name} no ha llegado")
    print(f"  {workers[FAR_INDEX].name} checó a 2.4 km de su obra · "
          f"{workers[NO_LOCATION_INDEX].name} checó sin ubicación"
          + (" · hay una foto repetida" if dup and original else ""))
    if mi_numero:
        print(f"  {missing.name} eres tú ({missing.phone_number}): manda \"presente\" en la demo.")


async def _seed_history(session, company_id: uuid.UUID, giro: str, workers: list[Worker],
                        crew_of: dict[int, Crew], today, photo_urls: list[str]) -> list[Event]:
    """30 días hacia atrás: asistencia con patrones creíbles y tareas cerradas con foto."""
    photos: list[Event] = []
    for back in range(1, HISTORY_DAYS):
        d = today - timedelta(days=back)
        if is_rest_day(d):
            continue
        for i, w in enumerate(workers):
            if i == LATE_INDEX and back in (1, 2, 4, 9, 15):
                status, hh, mm = "tarde", 8, 15 + (back * 7) % 25
            elif i == MISSING_INDEX and back in (3, 11):
                continue  # faltó: sin registro
            elif (i * 7 + back) % 29 == 0:
                continue
            elif (i * 3 + back) % 13 == 0:
                status, hh, mm = "tarde", 8, 12 + (i * 5 + back) % 20
            else:
                status, hh, mm = "presente", 7, (i * 11 + back * 7) % 55
            session.add(AttendanceDaily(
                company_id=company_id, worker_id=w.id, work_date=d, status=status,
                checkin_at=datetime.combine(d, time(hh, mm), tzinfo=TZ),
            ))

    titles = HISTORY_JOBS[giro]
    for n, back in enumerate((1, 2, 3, 5, 6, 8, 9, 10, 12, 15, 17, 19, 22, 24, 26)):
        d = today - timedelta(days=back)
        if is_rest_day(d):
            d -= timedelta(days=1)
        wi = (n * 3) % len(workers)
        w = workers[wi]
        crew = crew_of.get(wi)
        closed = datetime.combine(d, time(15, (n * 13) % 60), tzinfo=TZ)
        job = Job(
            company_id=company_id, branch_id=w.branch_id,
            crew_id=crew.id if crew else None, worker_id=None if crew else w.id,
            title=titles[n % len(titles)], status="completado",
            due_date=d + timedelta(days=(n % 3) - 1),
            created_at=closed - timedelta(days=2 + n % 3),
            completed_at=closed - timedelta(hours=1), approved_at=closed,
        )
        session.add(job)
        await session.flush()
        if n % 5 != 4:  # casi todas cerradas con foto
            photo = Event(
                company_id=company_id, worker_id=w.id, job_id=job.id,
                whatsapp_message_id=f"demo-{uuid.uuid4()}", raw_payload={"demo": True},
                event_type="photo", received_at=closed - timedelta(hours=1),
                media_url=photo_urls[n % len(photo_urls)] if photo_urls else None,
                text_content="Así quedó",
            )
            session.add(photo)
            photos.append(photo)
    await session.flush()
    return photos


WEB_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _is_web_image(p: Path) -> bool:
    """Solo formatos que cualquier navegador muestra (HEIC del iPhone no)."""
    return mimetypes.guess_type(p.name)[0] in WEB_IMAGE_TYPES


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--giro", choices=sorted(GIROS), required=True)
    parser.add_argument("--empresa", required=True, help='Nombre del prospecto, ej. "Constructora Pech"')
    parser.add_argument("--mi-numero", help="Tu celular; serás el trabajador que falta por llegar")
    parser.add_argument("--fotos", type=Path, help="Carpeta con imágenes del giro (se suben a R2)")
    parser.add_argument("--si", action="store_true", help="No pedir confirmación")
    args = parser.parse_args()

    # Validar antes de pedir confirmación: si algo falla, que sea antes de borrar nada.
    if args.fotos:
        args.fotos = args.fotos.expanduser()
        if not args.fotos.is_dir():
            raise SystemExit(
                f"No existe la carpeta de fotos {args.fotos}.\n"
                "Ojo: corre este script en tu máquina con `railway run`, no dentro del "
                "contenedor (`railway ssh`): ahí no están tus fotos."
            )
        files = list(args.fotos.iterdir())
        if heic := [p.name for p in files if p.suffix.lower() in (".heic", ".heif")]:
            print(f"⚠ Se ignoran {len(heic)} fotos HEIC (el navegador no las muestra): expórtalas como JPG")
        if not any(_is_web_image(p) for p in files):
            raise SystemExit(f"No hay imágenes jpg, png o webp en {args.fotos}")
        if not (settings.r2_account_id and settings.r2_access_key_id and settings.r2_public_url):
            raise SystemExit("Faltan las variables de R2: sin ellas las fotos no se pueden subir.")

    if not args.si:
        host = settings.database_url.split("@")[-1].split("/")[0]
        answer = input(f"Esto BORRA los datos de la empresa {settings.company_id} en {host}. Escribe SI: ")
        if answer.strip() != "SI":
            raise SystemExit("Cancelado")

    asyncio.run(seed_demo(args.giro, args.empresa, args.mi_numero, args.fotos))


if __name__ == "__main__":
    main()
