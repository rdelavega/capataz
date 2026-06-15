"""
Script de seed: inserta datos de prueba.
Ejecutar desde backend/: python seed.py
Requiere .env con DATABASE_URL válido.
"""
import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import Base, Branch, Company, Job, Worker

COMPANY_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


async def seed() -> None:
    engine = create_async_engine(settings.database_url, echo=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as session:
        async with session.begin():
            # Company
            company = Company(
                id=COMPANY_ID,
                name="Constructora Demo S.A.",
                slug="constructora-demo",
            )
            session.add(company)
            await session.flush()

            # Branches
            norte = Branch(company_id=COMPANY_ID, name="Sucursal Norte")
            sur = Branch(company_id=COMPANY_ID, name="Sucursal Sur")
            session.add_all([norte, sur])
            await session.flush()

            # Workers
            workers = [
                Worker(
                    company_id=COMPANY_ID,
                    branch_id=norte.id,
                    name="Juan López",
                    phone_number="+5215512345001",
                    title="Maestro Albañil",
                ),
                Worker(
                    company_id=COMPANY_ID,
                    branch_id=norte.id,
                    name="María García",
                    phone_number="+5215512345002",
                    title="Plomera",
                ),
                Worker(
                    company_id=COMPANY_ID,
                    branch_id=sur.id,
                    name="Carlos Pérez",
                    phone_number="+5215512345003",
                    title="Electricista",
                ),
                Worker(
                    company_id=COMPANY_ID,
                    branch_id=sur.id,
                    name="Ana Martínez",
                    phone_number="+5215512345004",
                    title="Supervisora de obra",
                ),
            ]
            session.add_all(workers)
            await session.flush()

            # Jobs
            jobs = [
                Job(
                    company_id=COMPANY_ID,
                    branch_id=norte.id,
                    worker_id=workers[0].id,
                    title="Instalación eléctrica piso 2",
                    status="en_progreso",
                ),
                Job(
                    company_id=COMPANY_ID,
                    branch_id=norte.id,
                    worker_id=workers[1].id,
                    title="Revisión de tuberías",
                    status="pendiente",
                ),
                Job(
                    company_id=COMPANY_ID,
                    branch_id=sur.id,
                    worker_id=workers[2].id,
                    title="Pintura exterior",
                    status="atrasado",
                ),
            ]
            session.add_all(jobs)

    print(f"\n✓ Seed completado. COMPANY_ID={COMPANY_ID}")
    print("Agrega esto a tu .env:")
    print(f"  COMPANY_ID={COMPANY_ID}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
