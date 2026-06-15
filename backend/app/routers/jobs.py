import uuid
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.branch import Branch
from app.models.job import Job
from app.models.worker import Worker

router = APIRouter(prefix="/jobs", tags=["jobs"])

VALID_STATUSES = {"pendiente", "en_progreso", "completado", "atrasado"}


class JobCreate(BaseModel):
    title: str
    description: str | None = None
    worker_id: uuid.UUID | None = None
    due_date: date | None = None


class JobUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    worker_id: uuid.UUID | None = None
    due_date: date | None = None


@router.get("")
async def list_jobs(
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)

    q = (
        select(Job, Worker, Branch)
        .outerjoin(Worker, Job.worker_id == Worker.id)
        .outerjoin(Branch, Job.branch_id == Branch.id)
        .where(Job.company_id == company_id)
        .order_by(Job.updated_at.desc())
    )
    if status and status in VALID_STATUSES:
        q = q.where(Job.status == status)

    rows = await session.execute(q)
    jobs = []
    for job, worker, branch in rows.tuples():
        jobs.append({
            "id": str(job.id),
            "title": job.title,
            "description": job.description,
            "status": job.status,
            "due_date": job.due_date.isoformat() if job.due_date else None,
            "worker_id": str(job.worker_id) if job.worker_id else None,
            "worker_name": worker.name if worker else None,
            "branch_id": str(job.branch_id) if job.branch_id else None,
            "branch_name": branch.name if branch else None,
            "created_at": job.created_at.isoformat(),
            "updated_at": job.updated_at.isoformat(),
        })
    return {"jobs": jobs}


@router.post("", status_code=201)
async def create_job(
    body: JobCreate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)

    branch_id: uuid.UUID | None = None
    if body.worker_id:
        result = await session.execute(select(Worker).where(Worker.id == body.worker_id))
        worker = result.scalar_one_or_none()
        if worker:
            branch_id = worker.branch_id

    job = Job(
        company_id=company_id,
        title=body.title.strip(),
        description=body.description.strip() if body.description else None,
        worker_id=body.worker_id,
        branch_id=branch_id,
        due_date=body.due_date,
        status="pendiente",
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return {"id": str(job.id)}


@router.patch("/{job_id}", status_code=200)
async def update_job(
    job_id: uuid.UUID,
    body: JobUpdate,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Job).where(Job.id == job_id, Job.company_id == company_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    updates = body.model_dump(exclude_unset=True)

    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"status inválido: {updates['status']}")

    if "title" in updates and updates["title"]:
        job.title = updates["title"].strip()
    if "description" in updates:
        job.description = updates["description"].strip() if updates["description"] else None
    if "status" in updates:
        job.status = updates["status"]
    if "due_date" in updates:
        job.due_date = updates["due_date"]
    if "worker_id" in updates and updates["worker_id"]:
        job.worker_id = updates["worker_id"]
        res2 = await session.execute(select(Worker).where(Worker.id == updates["worker_id"]))
        w = res2.scalar_one_or_none()
        if w:
            job.branch_id = w.branch_id

    await session.commit()
    return {"ok": True}


@router.delete("/{job_id}", status_code=200)
async def delete_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_db),
) -> dict:
    company_id = uuid.UUID(settings.company_id)
    result = await session.execute(
        select(Job).where(Job.id == job_id, Job.company_id == company_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await session.delete(job)
    await session.commit()
    return {"ok": True}
