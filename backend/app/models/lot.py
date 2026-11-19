from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.core.time import utcnow

if TYPE_CHECKING:
    from app.models.project import Project

LOT_CODE_MAX_LENGTH = 10
LOT_DESIGNATION_MAX_LENGTH = 120


class Lot(Base):
    """A categorizer for transactions.

    A lot with no ``project_id`` is global: every project sees it, and only
    an admin adds, renames, reorders or deletes it (a lot no transaction
    uses). A lot with a ``project_id`` belongs to
    that project only and is listed after the global lots, ordered by code.
    """

    __tablename__ = 'lots'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey('projects.id', ondelete='CASCADE'), nullable=True, index=True
    )
    code: Mapped[str] = mapped_column(String(LOT_CODE_MAX_LENGTH), nullable=False)
    designation: Mapped[str] = mapped_column(
        String(LOT_DESIGNATION_MAX_LENGTH), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(
        default=0, server_default='0', nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utcnow,
        server_default=func.now(),
        onupdate=utcnow,
        nullable=False,
    )

    __table_args__ = (
        Index(
            'uq_lots_global_code',
            'code',
            unique=True,
            postgresql_where=text('project_id IS NULL'),
        ),
        Index(
            'uq_lots_global_designation',
            'designation',
            unique=True,
            postgresql_where=text('project_id IS NULL'),
        ),
        Index(
            'uq_lots_project_id_code',
            'project_id',
            'code',
            unique=True,
            postgresql_where=text('project_id IS NOT NULL'),
        ),
    )

    project: Mapped[Project | None] = relationship('Project')

    @property
    def is_global(self) -> bool:
        return self.project_id is None


class ProjectHiddenLot(Base):
    """A lot hidden in one project. No row means the lot is visible."""

    __tablename__ = 'project_hidden_lots'

    project_id: Mapped[int] = mapped_column(
        ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True
    )
    lot_id: Mapped[int] = mapped_column(
        ForeignKey('lots.id', ondelete='CASCADE'), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )


class SupplierLot(Base):
    """A supplier assigned to a lot in one project."""

    __tablename__ = 'supplier_lots'

    project_id: Mapped[int] = mapped_column(
        ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True
    )
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey('suppliers.id', ondelete='CASCADE'), primary_key=True, index=True
    )
    lot_id: Mapped[int] = mapped_column(
        ForeignKey('lots.id', ondelete='CASCADE'), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=utcnow,
        server_default=func.now(),
        nullable=False,
    )
