import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

AttendanceStatus = Enum("presente", "ausente", "tarde", name="attendance_status")


class AttendanceDaily(Base):
    __tablename__ = "attendance_daily"
    __table_args__ = (UniqueConstraint("worker_id", "work_date"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workers.id", ondelete="CASCADE"), nullable=False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(AttendanceStatus, nullable=False, default="presente")
    checkin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
    # Resultado de comparar la ubicación del check-in con la obra:
    # en_sitio · lejos · sin_referencia (la obra no tiene ubicación) · None (no la mandó).
    # Solo se guarda el resultado; las coordenadas viven en events y se borran.
    location_status: Mapped[str | None] = mapped_column(String)
    location_distance_m: Mapped[int | None] = mapped_column(Integer)
    location_branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"))
    location_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    worker: Mapped["Worker"] = relationship(back_populates="attendance")  # noqa: F821
