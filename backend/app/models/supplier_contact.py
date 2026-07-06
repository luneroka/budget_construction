from datetime import datetime, UTC

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SupplierContact(Base):
    __tablename__ = 'supplier_contacts'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey('suppliers.id', ondelete='CASCADE'), nullable=False, index=True
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_primary: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default='false',
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

    __table_args__: tuple[Index, ...] = (
        Index(
            'uq_supplier_contacts_primary_per_supplier',
            'supplier_id',
            unique=True,
            postgresql_where=text('is_primary IS TRUE'),
        ),
    )

    supplier = relationship('Supplier', back_populates='contacts')

    def __repr__(self):
        return f'<SupplierContact id={self.id} supplier_id={self.supplier_id}>'
