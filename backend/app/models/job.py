import uuid
from datetime import date, datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

# por_revisar: el trabajador dijo "terminé" y espera el visto bueno del dueño.
# completado: el dueño ya aprobó (approved_at).
JobStatus = Enum("pendiente", "en_progreso", "por_revisar", "completado", "atrasado", name="job_status")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"))
    worker_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("workers.id", ondelete="SET NULL"))
    # Lo normal: el trabajo es de una cuadrilla (worker_id vacío). worker_id es opcional
    # para cuando el dueño sí quiere encargárselo a una persona.
    crew_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("crews.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(JobStatus, nullable=False, default="pendiente")
    due_date: Mapped[date | None]
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)
    # Cuándo el encargado (o la persona) apretó "Enterado" en el aviso de asignación.
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "Tengo un problema": cuándo lo reportó y qué dijo (el bot le pregunta qué pasó).
    problem_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    problem_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    worker: Mapped["Worker | None"] = relationship()  # noqa: F821
