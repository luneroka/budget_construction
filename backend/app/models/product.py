from datetime import datetime, UTC

from sqlalchemy import ForeignKey, DateTime, String, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Product(Base):
    __tablename__ = 'products'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    subcategory_id: Mapped[int] = mapped_column(
        ForeignKey('subcategories.id', ondelete='CASCADE'), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(
        default=0, server_default='0', nullable=False
    )
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
            'subcategory_id',
            'name',
            name='uq_products_subcategory_id_name',
        ),
    )

    subcategory = relationship('Subcategory', back_populates='products')
    # project_items = relationship('ProjectItem', back_populates='source_product')
    # template_items = relationship('ProjectTemplateItem', back_populates='product')

    def __repr__(self):
        return f'<Product id={self.id}, name={self.name}>'
