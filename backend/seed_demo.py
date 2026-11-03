"""
Arma un día de trabajo creíble para una demo, según el giro del prospecto.

El tablero cuenta una historia: una sucursal en rojo (tarea atrasada), otra en
amarillo (alguien no ha llegado), uno que llegó tarde, fotos con avance y un
audio transcrito. Si pasas --mi-numero, ese trabajador es el que falta: mandas
"presente" en vivo durante la demo y el tablero cambia frente al cliente.

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

from app.config import settings
from app.db import AsyncSessionLocal, engine
from app.models import AttendanceDaily, Branch, Company, Event, Job, Worker
from app.phone import normalize_phone
from app.services import storage
from app.timeutil import TZ, local_now, local_today

# Cada giro: 2 sucursales, 8 trabajadores (nombre, puesto, índice de sucursal),
# tareas (título, índice de trabajador, estado, días para entrega),
# fotos (índice de trabajador, índice de tarea, caption) y un audio.
GIROS: dict[str, dict] = {
    "construccion": {
        "branches": ["Obra Altabrisa — Torre B", "Obra Cholul — Casa Muestra"],
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
            ("Levantar muros de baño", 1, "completado", 0),
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
            ("Enderezado puerta Versa", 3, "completado", 0),
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
            ("Cobranza tiendas Centro", 3, "completado", 0),
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
            ("Limpieza profunda oficinas Altabrisa", 3, "completado", 0),
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


def _at(t: time, shift: timedelta) -> datetime:
    return datetime.combine(local_today(), t, tzinfo=TZ) - shift


async def seed_demo(giro: str, empresa: str, mi_numero: str | None, fotos: Path | None) -> None:
    data = GIROS[giro]
    company_id = uuid.UUID(settings.company_id)
    today = local_today()

    # Si la demo es temprano, recorre la historia para que nada quede en el futuro
    latest = datetime.combine(today, time(11, 30), tzinfo=TZ)
    shift = max(timedelta(0), latest - (local_now() - timedelta(minutes=10)))

    photo_files = sorted(
        p for p in (fotos.iterdir() if fotos else [])
        if (mimetypes.guess_type(p.name)[0] or "").startswith("image/")
    )
    if fotos and not photo_files:
        print(f"⚠ No encontré imágenes en {fotos}")
    if not fotos:
        print("⚠ Sin --fotos: los eventos de foto no tendrán imagen en la galería")

    async with AsyncSessionLocal() as session, session.begin():
        for model in (AttendanceDaily, Event, Job, Worker, Branch):
            await session.execute(delete(model).where(model.company_id == company_id))

        company = await session.get(Company, company_id)
        if company is None:
            raise SystemExit(f"No existe la empresa {company_id}; corre seed.py primero")
        company.name = empresa

        branches = [Branch(company_id=company_id, name=n) for n in data["branches"]]
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
            ))
        session.add_all(workers)
        await session.flush()

        jobs: list[Job] = []
        for title, w, status, days in data["jobs"]:
            jobs.append(Job(
                company_id=company_id, branch_id=workers[w].branch_id,
                worker_id=workers[w].id, title=title, status=status,
                due_date=today + timedelta(days=days),
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

        for i, checkin in enumerate(CHECKINS):
            if checkin is None:
                continue
            t, text = checkin
            at = _at(t, shift)
            e = event(workers[i], at, "checkin", text_content=text)
            await session.flush()
            session.add(AttendanceDaily(
                company_id=company_id, worker_id=workers[i].id, work_date=today,
                status="tarde" if i == LATE_INDEX else "presente",
                checkin_at=at, event_id=e.id,
            ))

        for n, (w, j, caption) in enumerate(data["photos"]):
            media_url = None
            if n < len(photo_files):
                f = photo_files[n]
                key = f"media/{company_id}/demo-{giro}-{n}{f.suffix.lower()}"
                media_url = storage.upload_to_r2(f.read_bytes(), key)
            event(workers[w], _at(time(9 + n, 20), shift), "photo",
                  job_id=jobs[j].id, text_content=caption, media_url=media_url)

        w, transcript = data["audio"]
        event(workers[w], _at(time(10, 5), shift), "audio",
              transcription=transcript, text_content=None)

        w, text = data["text"]
        event(workers[w], _at(time(10, 48), shift), "text", text_content=text)

        event(workers[0], _at(time(11, 30), shift), "location",
              latitude=21.0190, longitude=-89.6237)

    await engine.dispose()

    missing = workers[MISSING_INDEX]
    print(f"\n✓ Demo '{giro}' lista para {empresa}")
    print(f"  {len(workers)} trabajadores · {len(jobs)} tareas · "
          f"{workers[LATE_INDEX].name} llegó tarde · {missing.name} no ha llegado")
    if mi_numero:
        print(f"  {missing.name} eres tú ({missing.phone_number}): manda \"presente\" en la demo.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--giro", choices=sorted(GIROS), required=True)
    parser.add_argument("--empresa", required=True, help='Nombre del prospecto, ej. "Constructora Pech"')
    parser.add_argument("--mi-numero", help="Tu celular; serás el trabajador que falta por llegar")
    parser.add_argument("--fotos", type=Path, help="Carpeta con imágenes del giro (se suben a R2)")
    parser.add_argument("--si", action="store_true", help="No pedir confirmación")
    args = parser.parse_args()

    if not args.si:
        host = settings.database_url.split("@")[-1].split("/")[0]
        answer = input(f"Esto BORRA los datos de la empresa {settings.company_id} en {host}. Escribe SI: ")
        if answer.strip() != "SI":
            raise SystemExit("Cancelado")

    asyncio.run(seed_demo(args.giro, args.empresa, args.mi_numero, args.fotos))


if __name__ == "__main__":
    main()
