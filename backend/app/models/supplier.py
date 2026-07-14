from datetime import datetime, UTC

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Supplier(Base):
    __tablename__ = 'suppliers'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    siret: Mapped[str | None] = mapped_column(String(14), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    street: Mapped[str | None] = mapped_column(String(255), nullable=True)
    complement: Mapped[str | None] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(5), nullable=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
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

    __table_args__: tuple[Index, ...] = (
        Index(
            'uq_suppliers_user_id_name',
            'user_id',
            'name',
            unique=True,
            postgresql_where=text('deleted_at IS NULL'),
        ),
    )

    user = relationship('User', back_populates='suppliers')
    transactions = relationship('Transaction', back_populates='supplier')
    contacts = relationship(
        'SupplierContact',
        back_populates='supplier',
        cascade='all, delete-orphan',
        order_by='SupplierContact.id',
    )
    documents = relationship(
        'SupplierDocument',
        back_populates='supplier',
        cascade='all, delete-orphan',
    )

    def __repr__(self):
        return f'<Supplier id={self.id} name={self.name}>'
