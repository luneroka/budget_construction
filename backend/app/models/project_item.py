from __future__ import annotations

from datetime import datetime, UTC
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.subcategory import Subcategory
    from app.models.product import Product
    from app.models.project import Project
    from app.models.project_template_item import ProjectTemplateItem
    from app.models.transaction import Transaction


class ProjectItem(Base):
    __tablename__ = 'project_items'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True
    )

    template_item_id: Mapped[int | None] = mapped_column(
        ForeignKey('project_template_items.id', ondelete='CASCADE'),
        nullable=True,
        index=True,
    )

    source_category_id: Mapped[int] = mapped_column(
        ForeignKey('categories.id'), nullable=False, index=True
    )

    source_subcategory_id: Mapped[int] = mapped_column(
        ForeignKey('subcategories.id'), nullable=False, index=True
    )
    source_product_id: Mapped[int] = mapped_column(
        ForeignKey('products.id'), nullable=False, index=True
    )
    parent_item_id: Mapped[int | None] = mapped_column(
        ForeignKey('project_items.id', ondelete='CASCADE'), nullable=True, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_custom: Mapped[bool] = mapped_column(
        default=False, server_default='false', nullable=False
    )
    is_breakdown_item: Mapped[bool] = mapped_column(
        default=False, server_default='false', nullable=False
    )
    sort_order: Mapped[int] = mapped_column(
        default=0, server_default='0', nullable=False
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

    project: Mapped[Project] = relationship('Project')
    template_item: Mapped[ProjectTemplateItem | None] = relationship(
        'ProjectTemplateItem'
    )
    source_category: Mapped[Category] = relationship('Category')
    source_subcategory: Mapped[Subcategory] = relationship('Subcategory')
    source_product: Mapped[Product] = relationship('Product')
    parent_item: Mapped[ProjectItem | None] = relationship(
        'ProjectItem',
        remote_side=[id],
        back_populates='child_items',
    )
    child_items: Mapped[list[ProjectItem]] = relationship(
        'ProjectItem',
        back_populates='parent_item',
        cascade='all, delete-orphan',
    )
    transactions: Mapped[list[Transaction]] = relationship(
        'Transaction',
        back_populates='project_item',
        cascade='all, delete-orphan',
    )
