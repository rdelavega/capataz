import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, ImageOps
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import geo
from app.config import settings
from app.db import get_db
from app.models.branch import Branch
from app.models.crew import Crew
from app.models.event import Event
from app.models.worker import Worker
from app.phone import normalize_phone
from app.services import insights, notify, storage
from app.services import photos as photo_svc
from app.timeutil import local_date

router = APIRouter(prefix="/workers", tags=["workers"])


class WorkerCreate(BaseModel):
    name: str
    phone_number: str
    branch_id: uuid.UUID
    title: str | None = None
    crew_id: uuid.UUID | None = None


class WorkerUpdate(BaseModel):
    title: str | None = None
    branch_id: uuid.UUID | None = None
    crew_id: uuid.UUID | None = None


class CrewIn(BaseModel):
    name: str | None = None
    branch_id: uuid.UUID | None = None
    lead_worker_id: uuid.UUID | None = None


class BranchCreate(BaseModel):
    name: str
    # Link de Google Maps (largo o corto) o "lat, lng". Opcional.
    location: str | None = None


class BranchUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    geofence_m: int | None = None


def _branch_dict(b: Branch) -> dict:
    has_location = b.latitude is not None and b.longitude is not None
    return {
        "id": str(b.id), "name": b.name, "has_location": has_location,
        "maps_url": f"https://www.google.com/maps?q={b.latitude},{b.longitude}" if has_location else None,
        "geofence_m": b.geofence_m or settings.geofence_meters,
    }


async def _set_location(branch: Branch, text: str | None) -> None:
    """Vacío borra la ubicación; un link o coordenadas que no se entienden es error."""
    if not text or not text.strip():
        branch.latitude = branch.longitude = None
        return
    found = await geo.resolve_location(text)
    if found is None:
        raise HTTPException(
            status_code=422,
            detail="No encontré la ubicación en ese link. Abre el lugar en Google Maps, "
                   "toca Compartir y pega el link, o escribe las coordenadas (21.0190, -89.6237).",
        )
    branch.latitude, branch.longitude = found


@router.get("/branches")
async def list_branches(session: AsyncSession = Depends(get_db)) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Branch)
        .where(Branch.company_id == company_id)
        .order_by(Branch.name)
    )
    branches = result.scalars().all()
    return {"branches": [_branch_dict(b) for b in branches]}


@router.post("/branches", status_code=201)
async def create_branch(
    body: BranchCreate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    branch = Branch(company_id=company_id, name=body.name.strip())
    if body.location:
        await _set_location(branch, body.location)
    session.add(branch)
    await session.commit()
    await session.refresh(branch)
    return _branch_dict(branch)


@router.patch("/branches/{branch_id}", status_code=200)
async def update_branch(
    branch_id: uuid.UUID,
    body: BranchUpdate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    branch = (await session.execute(
        select(Branch).where(Branch.id == branch_id, Branch.company_id == uuid.UUID(settings.company_id))
    )).scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="No encontré ese lugar de trabajo")
    updates = body.model_dump(exclude_unset=True)
    if "name" in updates and (body.name or "").strip():
        branch.name = body.name.strip()
    if "location" in updates:
        await _set_location(branch, body.location)
    if "geofence_m" in updates:
        if body.geofence_m is not None and not 50 <= body.geofence_m <= 5000:
            raise HTTPException(status_code=422, detail="El radio debe estar entre 50 y 5,000 metros")
        branch.geofence_m = body.geofence_m
    await session.commit()
    return _branch_dict(branch)


# ─── Cuadrillas ───────────────────────────────────────────────────────────────

async def _get_crew(session: AsyncSession, crew_id: uuid.UUID) -> Crew:
    crew = (await session.execute(
        select(Crew).where(Crew.id == crew_id, Crew.company_id == uuid.UUID(settings.company_id))
    )).scalar_one_or_none()
    if not crew:
        raise HTTPException(status_code=404, detail="Cuadrilla no encontrada")
    return crew


async def _check_worker(session: AsyncSession, worker_id: uuid.UUID | None) -> Worker | None:
    if worker_id is None:
        return None
    w = (await session.execute(
        select(Worker).where(Worker.id == worker_id, Worker.company_id == uuid.UUID(settings.company_id))
    )).scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado")
    return w


async def _make_lead(session: AsyncSession, crew: Crew, lead: Worker | None) -> None:
    """El encargado es integrante de su cuadrilla y solo encabeza una."""
    crew.lead_worker_id = lead.id if lead else None
    if lead is None:
        return
    if lead.crew_id and lead.crew_id != crew.id:
        old = await session.get(Crew, lead.crew_id)
        if old and old.lead_worker_id == lead.id:
            old.lead_worker_id = None
    lead.crew_id = crew.id


@router.get("/crews")
async def list_crews(session: AsyncSession = Depends(get_db)) -> dict:
    company_id = uuid.UUID(settings.company_id)
    crews = (await session.execute(
        select(Crew).where(Crew.company_id == company_id).order_by(Crew.name)
    )).scalars().all()
    return {"crews": [
        {"id": str(c.id), "name": c.name,
         "branch_id": str(c.branch_id) if c.branch_id else None,
         "lead_worker_id": str(c.lead_worker_id) if c.lead_worker_id else None}
        for c in crews
    ]}


@router.post("/crews", status_code=201)
async def create_crew(body: CrewIn, session: AsyncSession = Depends(get_db)) -> dict:
    if not body.name or not body.name.strip():
        raise HTTPException(status_code=422, detail="Ponle nombre a la cuadrilla")
    lead = await _check_worker(session, body.lead_worker_id)
    crew = Crew(company_id=uuid.UUID(settings.company_id), name=body.name.strip(), branch_id=body.branch_id)
    session.add(crew)
    await session.flush()
    await _make_lead(session, crew, lead)
    await session.commit()
    return {"id": str(crew.id), "name": crew.name}


@router.patch("/crews/{crew_id}", status_code=200)
async def update_crew(crew_id: uuid.UUID, body: CrewIn, session: AsyncSession = Depends(get_db)) -> dict:
    crew = await _get_crew(session, crew_id)
    updates = body.model_dump(exclude_unset=True)
    if "name" in updates:
        if not (body.name or "").strip():
            raise HTTPException(status_code=422, detail="Ponle nombre a la cuadrilla")
        crew.name = body.name.strip()
    if "branch_id" in updates:
        crew.branch_id = body.branch_id
    if "lead_worker_id" in updates:
        await _make_lead(session, crew, await _check_worker(session, body.lead_worker_id))
    await session.commit()
    return {"ok": True}


@router.delete("/crews/{crew_id}", status_code=200)
async def delete_crew(crew_id: uuid.UUID, session: AsyncSession = Depends(get_db)) -> dict:
    """Borra la cuadrilla. Sus integrantes y trabajos se quedan, sin cuadrilla."""
    crew = await _get_crew(session, crew_id)
    await session.delete(crew)
    await session.commit()
    return {"ok": True}


@router.post("", status_code=201)
async def create_worker(
    body: WorkerCreate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    worker = Worker(
        company_id=company_id,
        branch_id=body.branch_id,
        name=body.name.strip(),
        phone_number=normalize_phone(body.phone_number),
        title=body.title.strip() if body.title else None,
        crew_id=(await _get_crew(session, body.crew_id)).id if body.crew_id else None,
        active=True,
    )
    session.add(worker)
    try:
        await session.commit()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Ese número ya está registrado")
    await session.refresh(worker)
    return {"id": str(worker.id), "name": worker.name}


@router.get("/{worker_id}/summary")
async def worker_summary(
    worker_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Ficha del trabajador: mes, calendario, lo que hizo hoy, tareas y fotos."""
    company_id = uuid.UUID(settings.company_id)
    worker = (await session.execute(
        select(Worker).where(Worker.id == worker_id, Worker.company_id == company_id)
    )).scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    s = await insights.load_snapshot(session, company_id)
    if worker not in s.workers:
        s.workers.append(worker)  # inactivo: igual mostramos su historial

    events_today = list((await session.execute(
        select(Event).where(Event.worker_id == worker.id, local_date(Event.received_at) == s.today)
    )).scalars())
    photo_filter = (Event.worker_id == worker.id, Event.event_type == "photo", Event.media_url.is_not(None))
    photos = list((await session.execute(
        select(Event).where(*photo_filter).order_by(Event.received_at.desc()).limit(6)
    )).scalars())
    photo_total = (await session.execute(select(func.count(Event.id)).where(*photo_filter))).scalar_one()

    originals = await photo_svc.load_originals(session, [*events_today, *photos])
    return insights.worker_summary(s, worker, events_today, photos, photo_total, originals)


PROFILE_PHOTO_PX = 512
PROFILE_PHOTO_MAX_BYTES = 15 * 1024 * 1024


def _profile_jpeg(data: bytes) -> bytes:
    """Recorta al centro en cuadrado, 512 px, JPEG: una foto de 5 MB queda en ~50 KB."""
    try:
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im = ImageOps.fit(im, (PROFILE_PHOTO_PX, PROFILE_PHOTO_PX), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            im.save(out, "JPEG", quality=85)
            return out.getvalue()
    except Exception as e:
        raise HTTPException(status_code=422, detail="Ese archivo no es una foto que pueda leer (usa JPG o PNG)") from e


@router.post("/{worker_id}/photo", status_code=200)
async def upload_worker_photo(
    worker_id: uuid.UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """Foto de perfil del trabajador. La sube el dueño desde la ficha."""
    worker = await _check_worker(session, worker_id)
    data = await file.read(PROFILE_PHOTO_MAX_BYTES + 1)
    if len(data) > PROFILE_PHOTO_MAX_BYTES:
        raise HTTPException(status_code=413, detail="La foto pesa más de 15 MB")
    jpeg = _profile_jpeg(data)
    # Nombre nuevo en cada cambio, para que el navegador no muestre la anterior
    key = f"media/{worker.company_id}/workers/{worker.id}-{uuid.uuid4().hex[:8]}.jpg"
    try:
        worker.photo_url = storage.upload_to_r2(jpeg, key, "image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=502, detail="No se pudo guardar la foto. Intenta de nuevo.") from e
    await session.commit()
    return {"photo_url": worker.photo_url}


@router.delete("/{worker_id}/photo", status_code=200)
async def delete_worker_photo(worker_id: uuid.UUID, session: AsyncSession = Depends(get_db)) -> dict:
    worker = await _check_worker(session, worker_id)
    worker.photo_url = None
    await session.commit()
    return {"ok": True}


@router.patch("/{worker_id}", status_code=200)
async def update_worker(
    worker_id: uuid.UUID,
    body: WorkerUpdate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Worker).where(
            Worker.id == worker_id,
            Worker.company_id == company_id,
        )
    )
    worker = result.scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    updates = body.model_dump(exclude_unset=True)
    if "title" in updates:
        worker.title = body.title.strip() if body.title else None
    if "branch_id" in updates:
        worker.branch_id = body.branch_id
    if "crew_id" in updates:
        if worker.crew_id and worker.crew_id != body.crew_id:
            old = await session.get(Crew, worker.crew_id)
            if old and old.lead_worker_id == worker.id:
                old.lead_worker_id = None  # deja de ser encargado al salirse
        worker.crew_id = (await _get_crew(session, body.crew_id)).id if body.crew_id else None
    await session.commit()
    return {"ok": True}


@router.delete("/{worker_id}", status_code=200)
async def deactivate_worker(
    worker_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Worker).where(
            Worker.id == worker_id,
            Worker.company_id == company_id,
        )
    )
    worker = result.scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    worker.active = False
    await session.commit()
    return {"ok": True}


@router.post("/{worker_id}/remind", status_code=200)
async def remind_worker(
    worker_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Worker).where(
            Worker.id == worker_id,
            Worker.company_id == company_id,
            Worker.active == True,
        )
    )
    worker = result.scalar_one_or_none()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    try:
        await notify.checkin_reminder(session, company_id, worker)
    except notify.NoWindow as e:
        raise HTTPException(
            status_code=409,
            detail="No ha escrito en 24 h y WhatsApp no deja mandarle mensaje. Escríbele desde tu celular.",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail="WhatsApp no dejó mandar el mensaje. Escríbele desde tu celular.",
        ) from e
    await session.commit()
    return {"ok": True}
