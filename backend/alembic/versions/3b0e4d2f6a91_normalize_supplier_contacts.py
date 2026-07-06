"""normalize supplier contacts

Revision ID: 3b0e4d2f6a91
Revises: c7a8f33f4ac4
Create Date: 2026-07-06 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '3b0e4d2f6a91'
down_revision: Union[str, Sequence[str], None] = 'c7a8f33f4ac4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'supplier_contacts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('supplier_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('phone_number', sa.String(length=50), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('is_primary', sa.Boolean(), server_default='false', nullable=False),
        sa.Column(
            'created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ['supplier_id'],
            ['suppliers.id'],
            ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_supplier_contacts_id'),
        'supplier_contacts',
        ['id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_supplier_contacts_supplier_id'),
        'supplier_contacts',
        ['supplier_id'],
        unique=False,
    )
    op.create_index(
        'uq_supplier_contacts_primary_per_supplier',
        'supplier_contacts',
        ['supplier_id'],
        unique=True,
        postgresql_where=sa.text('is_primary IS TRUE'),
    )

    op.execute("""
        INSERT INTO supplier_contacts (
            supplier_id,
            name,
            phone_number,
            email,
            is_primary,
            created_at,
            updated_at
        )
        SELECT
            id,
            contact_name,
            phone_number,
            email,
            true,
            created_at,
            updated_at
        FROM suppliers
        WHERE contact_name IS NOT NULL
            OR phone_number IS NOT NULL
            OR email IS NOT NULL
        """)

    op.drop_column('suppliers', 'contact_name')
    op.drop_column('suppliers', 'phone_number')
    op.drop_column('suppliers', 'email')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        'suppliers',
        sa.Column('email', sa.String(length=255), nullable=True),
    )
    op.add_column(
        'suppliers',
        sa.Column('phone_number', sa.String(length=50), nullable=True),
    )
    op.add_column(
        'suppliers',
        sa.Column('contact_name', sa.String(length=50), nullable=True),
    )

    op.execute("""
        UPDATE suppliers
        SET
            contact_name = selected_contacts.name,
            phone_number = selected_contacts.phone_number,
            email = selected_contacts.email
        FROM (
            SELECT DISTINCT ON (supplier_id)
                supplier_id,
                name,
                phone_number,
                email
            FROM supplier_contacts
            ORDER BY supplier_id, is_primary DESC, id ASC
        ) AS selected_contacts
        WHERE suppliers.id = selected_contacts.supplier_id
        """)

    op.drop_index(
        'uq_supplier_contacts_primary_per_supplier',
        table_name='supplier_contacts',
        postgresql_where=sa.text('is_primary IS TRUE'),
    )
    op.drop_index(
        op.f('ix_supplier_contacts_supplier_id'), table_name='supplier_contacts'
    )
    op.drop_index(op.f('ix_supplier_contacts_id'), table_name='supplier_contacts')
    op.drop_table('supplier_contacts')
