"""add type and expiry date to supplier documents

Revision ID: a02a0ce02bd7
Revises: ee6e9f1f2f1b
Create Date: 2026-11-19 10:00:00.000000

Spec: docs/specs/2026-11-19-supplier-documents.md (criterion 1).

Every existing supplier document was uploaded as the supplier's RIB, so
every existing row becomes `rib`, with no expiry date. Files, names and R2
keys are not touched. The downgrade drops both columns, and with them the
types and expiry dates entered since.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a02a0ce02bd7'
down_revision: Union[str, Sequence[str], None] = 'ee6e9f1f2f1b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

supplier_document_type_enum = sa.Enum(
    'rib',
    'kbis',
    'decennial_insurance',
    'urssaf_certificate',
    'other',
    name='supplier_document_type',
)


def upgrade() -> None:
    """Upgrade schema."""
    supplier_document_type_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'supplier_documents',
        sa.Column('type', supplier_document_type_enum, nullable=True),
    )
    op.execute("UPDATE supplier_documents SET type = 'rib'")
    op.alter_column('supplier_documents', 'type', nullable=False)
    op.add_column(
        'supplier_documents',
        sa.Column('expiry_date', sa.Date(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('supplier_documents', 'expiry_date')
    op.drop_column('supplier_documents', 'type')
    supplier_document_type_enum.drop(op.get_bind(), checkfirst=True)
