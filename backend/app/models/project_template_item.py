from __future__ import annotations

from datetime import datetime, UTC
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.project_template import ProjectTemplate


class ProjectTemplateItem(Base):
    __tablename__ = 'project_template_items'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    project_template_id: Mapped[int] = mapped_column(
        ForeignKey('project_templates.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey('products.id'), nullable=False, index=True
    )
    parent_template_item_id: Mapped[int | None] = mapped_column(
        ForeignKey('project_template_items.id', ondelete='CASCADE'),
        nullable=True,
        index=True,
    )

    default_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    sort_order: Mapped[int] = mapped_column(
        default=0, server_default='0', nullable=False
    )
    is_required: Mapped[bool] = mapped_column(
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

    template: Mapped[ProjectTemplate] = relationship(
        'ProjectTemplate', back_populates='template_items'
    )
    product: Mapped[Product] = relationship('Product', back_populates='template_items')
    parent_template_item: Mapped[ProjectTemplateItem | None] = relationship(
        'ProjectTemplateItem',
        remote_side=[id],
        back_populates='child_template_items',
    )
    child_template_items: Mapped[list[ProjectTemplateItem]] = relationship(
        'ProjectTemplateItem',
        back_populates='parent_template_item',
        cascade='all, delete-orphan',
    )

    def __repr__(self):
        return f'<Project Template Item id={self.id}, name={self.default_name}>'
