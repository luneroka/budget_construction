from __future__ import annotations

from datetime import datetime
from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.core.time import utcnow


class Category(Base):
    __tablename__ = 'categories'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    sort_order: Mapped[int] = mapped_column(
        default=0, server_default='0', nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        default=True, server_default='true', nullable=False
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

    subcategories = relationship('Subcategory', back_populates='category')

    def __repr__(self):
        return f'<Category id={self.id}, name={self.name}>'
