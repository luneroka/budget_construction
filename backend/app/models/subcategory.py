from datetime import datetime, UTC

from sqlalchemy import ForeignKey, DateTime, String, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Subcategory(Base):
    __tablename__ = 'subcategories'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    category_id: Mapped[int] = mapped_column(
        ForeignKey('categories.id', ondelete='CASCADE'), nullable=False, index=True
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
            'category_id',
            'name',
            name='uq_subcategories_category_id_name',
        ),
    )

    category = relationship('Category', back_populates='subcategories')
    products = relationship('Product', back_populates='subcategory')

    def __repr__(self):
        return f'<Subcategory id={self.id}, name={self.name}>'
