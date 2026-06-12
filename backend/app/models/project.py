from __future__ import annotations

from datetime import date, datetime, UTC
from typing import TYPE_CHECKING

import enum
from sqlalchemy import ForeignKey, Date, DateTime, Enum, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.budget_line import BudgetLine
    from app.models.template import Template


class ProjectStatus(str, enum.Enum):
    draft = 'draft'
    active = 'active'
    completed = 'completed'
    archived = 'archived'


class Project(Base):
    __tablename__ = 'projects'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey('templates.id', ondelete='SET NULL'), nullable=True, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    project_status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name='project_status'),
        default=ProjectStatus.active,
        server_default=ProjectStatus.active.value,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC).replace(tzinfo=None),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC).replace(tzinfo=None),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__: tuple[Index, ...] = (
        Index(
            'uq_projects_user_id_name',
            'user_id',
            'name',
            unique=True,
            postgresql_where=text('deleted_at IS NULL'),
        ),
    )

    user = relationship('User', back_populates='projects')
    template: Mapped[Template | None] = relationship('Template')
    budget_lines: Mapped[list[BudgetLine]] = relationship(
        'BudgetLine', back_populates='project'
    )

    def __repr__(self):
        return f'<Project id={self.id} name={self.name}>'
