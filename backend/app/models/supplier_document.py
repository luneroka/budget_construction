from __future__ import annotations

import enum
from datetime import date, datetime
from sqlalchemy import (
    Date,
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
from app.core.time import utcnow


class SupplierDocumentType(str, enum.Enum):
    """The five kinds of supplier paperwork, stored as stable English keys;
    the French labels live in the frontend."""

    rib = 'rib'
    kbis = 'kbis'
    decennial_insurance = 'decennial_insurance'
    urssaf_certificate = 'urssaf_certificate'
    other = 'other'


class SupplierDocument(Base):
    __tablename__ = 'supplier_documents'

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    supplier_id: Mapped[int] = mapped_column(
        ForeignKey('suppliers.id', ondelete='CASCADE'), nullable=False, index=True
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True
    )

    type: Mapped[SupplierDocumentType] = mapped_column(
        Enum(SupplierDocumentType, name='supplier_document_type'), nullable=False
    )
    # A date, no time: the document is valid through that day.
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(255), nullable=False)

    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)

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
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index(
            'ix_supplier_documents_active_user_created_at',
            'user_id',
            'created_at',
            postgresql_where=text('deleted_at IS NULL'),
        ),
    )

    supplier = relationship('Supplier', back_populates='documents')
    user = relationship('User')

    def __repr__(self):
        return f'<SupplierDocument id={self.id}, Supplier id={self.supplier_id}>'
