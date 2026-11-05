import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    # Cómo le llaman a sus lugares de trabajo: obra · sucursal · ruta · zona (ver app/sites.py)
    site_label: Mapped[str] = mapped_column(String, nullable=False, default="obra", server_default="obra")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    branches: Mapped[list["Branch"]] = relationship(back_populates="company")  # noqa: F821
    workers: Mapped[list["Worker"]] = relationship(back_populates="company")  # noqa: F821
