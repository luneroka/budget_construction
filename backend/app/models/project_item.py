from __future__ import annotations

from datetime import datetime, UTC
from typing import TYPE_CHECKING

import enum
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.project import Project
    from app.models.project_template_item import ProjectTemplateItem
    from app.models.transaction import Transaction


class ProjectItemType(str, enum.Enum):
    product = 'product'
    breakdown = 'breakdown'


class ProjectItem(Base):
    __tablename__ = 'project_items'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True
    )

    template_item_id: Mapped[int | None] = mapped_column(
        ForeignKey('project_template_items.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey('products.id'), nullable=False, index=True
    )
    parent_item_id: Mapped[int | None] = mapped_column(
        ForeignKey('project_items.id', ondelete='CASCADE'), nullable=True, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    item_type: Mapped[ProjectItemType] = mapped_column(
        Enum(ProjectItemType, name='project_item_type'),
        nullable=False,
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

    __table_args__ = (
        CheckConstraint(
            "item_type = 'breakdown' OR parent_item_id IS NULL",
            name='ck_project_items_product_has_no_parent',
        ),
        Index(
            'uq_project_items_project_id_product_id_product_type',
            'project_id',
            'product_id',
            unique=True,
            postgresql_where=text("item_type = 'product' AND deleted_at IS NULL"),
        ),
    )

    project: Mapped[Project] = relationship('Project', back_populates='project_items')
    template_item: Mapped[ProjectTemplateItem | None] = relationship(
        'ProjectTemplateItem'
    )
    product: Mapped[Product] = relationship('Product', back_populates='project_items')
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
