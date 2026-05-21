"""scope suppliers to users

Revision ID: 8f7643a83c9f
Revises: 3f03ffd87e2b
Create Date: 2026-05-21 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8f7643a83c9f'
down_revision: Union[str, Sequence[str], None] = '3f03ffd87e2b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('suppliers', sa.Column('user_id', sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE suppliers
        SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1)
        WHERE user_id IS NULL
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM suppliers WHERE user_id IS NULL) THEN
                RAISE EXCEPTION
                    'Cannot add non-null suppliers.user_id: existing suppliers need a user';
            END IF;
        END $$;
        """
    )
    op.alter_column('suppliers', 'user_id', nullable=False)
    op.create_index(op.f('ix_suppliers_user_id'), 'suppliers', ['user_id'], unique=False)
    op.drop_constraint('uq_suppliers_name', 'suppliers', type_='unique')
    op.create_unique_constraint(
        'uq_suppliers_user_id_name', 'suppliers', ['user_id', 'name']
    )
    op.create_foreign_key(
        'fk_suppliers_user_id_users',
        'suppliers',
        'users',
        ['user_id'],
        ['id'],
        ondelete='CASCADE',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_suppliers_user_id_users', 'suppliers', type_='foreignkey')
    op.drop_constraint('uq_suppliers_user_id_name', 'suppliers', type_='unique')
    op.create_unique_constraint('uq_suppliers_name', 'suppliers', ['name'])
    op.drop_index(op.f('ix_suppliers_user_id'), table_name='suppliers')
    op.drop_column('suppliers', 'user_id')
