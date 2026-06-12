from __future__ import annotations

from datetime import datetime, UTC
from typing import TYPE_CHECKING

import enum
from sqlalchemy import (
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
    from app.models.template_item import TemplateItem
    from app.models.transaction import Transaction


class BudgetLineType(str, enum.Enum):
    product = 'product'
    breakdown = 'breakdown'


class BudgetLine(Base):
    __tablename__ = 'budget_lines'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    project_id: Mapped[int] = mapped_column(
        ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True
    )

    template_item_id: Mapped[int | None] = mapped_column(
        ForeignKey('template_items.id', ondelete='SET NULL'),
        nullable=True,
        index=True,
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey('products.id'), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    item_type: Mapped[BudgetLineType] = mapped_column(
        Enum(BudgetLineType, name='budget_line_type'),
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
        Index(
            'uq_budget_lines_project_id_product_id_product_type',
            'project_id',
            'product_id',
            unique=True,
            postgresql_where=text("item_type = 'product' AND deleted_at IS NULL"),
        ),
    )

    project: Mapped[Project] = relationship('Project', back_populates='budget_lines')
    template_item: Mapped[TemplateItem | None] = relationship('TemplateItem')
    product: Mapped[Product] = relationship('Product', back_populates='budget_lines')
    transactions: Mapped[list[Transaction]] = relationship(
        'Transaction',
        back_populates='budget_line',
        cascade='all, delete-orphan',
    )
