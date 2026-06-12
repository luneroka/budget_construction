from __future__ import annotations

from datetime import datetime, UTC
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, DateTime, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.product import Product
    from app.models.template import Template


class TemplateItem(Base):
    __tablename__ = 'template_items'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    template_id: Mapped[int] = mapped_column(
        ForeignKey('templates.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey('products.id'), nullable=False, index=True
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

    __table_args__: tuple[UniqueConstraint, ...] = (
        UniqueConstraint(
            'template_id',
            'product_id',
            name='uq_template_items_template_id_product_id',
        ),
    )

    template: Mapped[Template] = relationship(
        'Template', back_populates='template_items'
    )
    product: Mapped[Product] = relationship('Product', back_populates='template_items')

    def __repr__(self):
        return f'<Template Item id={self.id}, name={self.default_name}>'
