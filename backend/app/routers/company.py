import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.company import Company
from app.sites import SITE_LABELS, site_or_default

router = APIRouter(prefix="/company", tags=["company"])


class CompanyUpdate(BaseModel):
    site_label: str


def _company_dict(c: Company) -> dict:
    site = site_or_default(c.site_label)
    return {"name": c.name, "site_label": site, "site_label_plural": SITE_LABELS[site],
            "site_options": list(SITE_LABELS)}


async def _company(session: AsyncSession) -> Company:
    company = await session.get(Company, uuid.UUID(settings.company_id))
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return company


@router.get("")
async def get_company(session: AsyncSession = Depends(get_db)) -> dict:
    return _company_dict(await _company(session))


@router.patch("")
async def update_company(body: CompanyUpdate, session: AsyncSession = Depends(get_db)) -> dict:
    if body.site_label not in SITE_LABELS:
        raise HTTPException(status_code=422, detail=f"Opciones: {', '.join(SITE_LABELS)}")
    company = await _company(session)
    company.site_label = body.site_label
    await session.commit()
    return _company_dict(company)
