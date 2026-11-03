"""
Cambios de esquema idempotentes que se aplican al arrancar la app.

Mientras no haya Alembic, cada sentencia debe poder correr N veces sin error
(IF NOT EXISTS). Al migrar a Alembic, este archivo se vuelve la primera revisión.
"""
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

STATEMENTS: list[str] = [
    "ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'por_revisar'",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ",
    "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS review_note TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT",
    "CREATE INDEX IF NOT EXISTS idx_events_job ON events (job_id)",
    """
    CREATE TABLE IF NOT EXISTS notifications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL,
        worker_id   UUID REFERENCES workers(id) ON DELETE CASCADE,
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        job_id      UUID REFERENCES jobs(id) ON DELETE CASCADE,
        ok          BOOLEAN NOT NULL DEFAULT TRUE,
        error       TEXT,
        sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications (company_id, sent_at DESC)",
    """
    CREATE TABLE IF NOT EXISTS scheduled_runs (
        kind      TEXT NOT NULL,
        run_date  DATE NOT NULL,
        ran_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (kind, run_date)
    )
    """,
]


async def run_migrations(engine: AsyncEngine) -> None:
    # ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción que lo crea:
    # cada sentencia va en autocommit.
    async with engine.connect() as conn:
        conn = await conn.execution_options(isolation_level="AUTOCOMMIT")
        for stmt in STATEMENTS:
            await conn.execute(text(stmt))
    logger.info("Migraciones aplicadas (%d sentencias)", len(STATEMENTS))
