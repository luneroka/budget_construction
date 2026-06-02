from __future__ import annotations

from datetime import datetime, UTC
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.template_item import TemplateItem


class Template(Base):
    __tablename__ = 'templates'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        default=True, server_default='true', nullable=False
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

    __table_args__: tuple[UniqueConstraint, ...] = (
        UniqueConstraint(
            'name',
            name='uq_template_name',
        ),
    )

    template_items: Mapped[list[TemplateItem]] = relationship(
        'TemplateItem',
        back_populates='template',
        cascade='all, delete-orphan',
    )

    def __repr__(self):
        return f'<Template id={self.id}, name={self.name}>'
