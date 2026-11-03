import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Crew(Base):
    """
    Cuadrilla: el equipo al que el dueño le manda trabajos. Tiene un encargado
    (maestro de obra, jefe de cuadrilla) que es con quien habla el bot.
    Una obra/sucursal puede tener varias cuadrillas; branch_id es la obra
    habitual y puede ser nula si la cuadrilla se mueve entre obras.
    """

    __tablename__ = "crews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    # use_alter: crews→workers y workers→crews se referencian mutuamente.
    lead_worker_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workers.id", ondelete="SET NULL", use_alter=True, name="crews_lead_fk")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
