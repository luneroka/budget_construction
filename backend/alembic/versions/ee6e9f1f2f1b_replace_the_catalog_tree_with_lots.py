"""replace the catalog tree with global lots organized by supplier

Revision ID: ee6e9f1f2f1b
Revises: 95ffcf47d9d2
Create Date: 2026-11-18 10:00:00.000000

Spec: docs/specs/2026-11-18-lots.md (criteria 24-27).

The default lots and the product -> lot mapping are copied here on purpose:
a migration must keep doing what it did on the day it ran, whatever the
application code becomes later.

The old catalog, template and budget line tables, the `diy_estimate` enum
value and `transactions.is_selected_budget` (read by the analytics views)
stay in place until a later cleanup migration. Documents, their
`transaction_id` and the R2 objects are not touched.
"""

import logging
import unicodedata
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'ee6e9f1f2f1b'
down_revision: Union[str, Sequence[str], None] = '95ffcf47d9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger('alembic.lots')

# Spec Appendix A, in display order.
DEFAULT_LOTS: tuple[tuple[str, str], ...] = (
    ('00', 'Préparation de chantier'),
    ('01', 'Terrassement / VRD'),
    ('02', 'Gros œuvre / Maçonnerie'),
    ('03', 'Charpente'),
    ('04', 'Couverture / Zinguerie'),
    ('05', 'Étanchéité'),
    ('06', 'Menuiseries extérieures'),
    ('07', 'Fermetures / Occultations'),
    ('08', 'Ravalement façade'),
    ('09', 'Serrurerie / Métallerie'),
    ('10', 'Cloisons'),
    ('11', 'Menuiseries intérieures'),
    ('12', 'Électricité CFO/CFA'),
    ('13', 'Plomberie / Sanitaires'),
    ('14', 'Chauffage / Ventilation / ECS'),
    ('15', 'Carrelage / Faïence'),
    ('16', 'Sols souples / Parquets'),
    ('17', 'Peinture / Revêtements muraux'),
    ('18', 'Aménagements extérieurs'),
    ('19', 'Nettoyage de fin de chantier'),
    ('20', 'Cuisine équipée'),
    ('21', 'Photovoltaïque / Solaire thermique'),
    ('22', 'Piscine'),
    ('23', 'Domotique'),
    ('24', 'Cheminée / Poêle'),
)

# Spec Appendix B. (category, subcategory) -> lot code for every product of
# that subcategory; None means only the listed product exceptions map.
SUBCATEGORY_LOTS: dict[tuple[str, str], str | None] = {
    ('Terrain & Préparation', 'Études & administratif'): '00',
    ('Terrain & Préparation', 'Accès chantier'): '00',
    ('Terrain & Préparation', 'Terrassement'): '01',
    ('Viabilisation', 'Raccordement eau'): '01',
    ('Viabilisation', 'Raccordement électricité'): '01',
    ('Viabilisation', 'Télécom / fibre'): '01',
    ('Viabilisation', 'Assainissement'): '01',
    ('Gros œuvre', 'Fondations'): '02',
    ('Gros œuvre', 'Soubassement / vide sanitaire'): '02',
    ('Gros œuvre', 'Dalle'): '02',
    ('Gros œuvre', 'Élévation murs'): '02',
    ('Gros œuvre', 'Charpente'): '03',
    ('Gros œuvre', 'Couverture'): '04',
    ('Gros œuvre', 'Façades'): '08',
    ('Menuiseries', 'Fenêtres'): '06',
    ('Menuiseries', 'Portes extérieures'): '06',
    ('Menuiseries', 'Volets'): '07',
    ('Second œuvre', 'Isolation'): '10',
    ('Second œuvre', 'Cloisons'): '10',
    ('Second œuvre', 'Électricité'): '12',
    ('Second œuvre', 'Plomberie'): '13',
    ('Second œuvre', 'Chauffage'): '14',
    ('Second œuvre', 'Ventilation'): '14',
    ('Finitions', 'Sols'): None,
    ('Finitions', 'Murs & plafonds'): '17',
    ('Finitions', 'Cuisine'): '20',
    ('Finitions', 'Salle de bain'): '13',
    ('Extérieurs', 'Aménagement terrain'): '18',
    ('Extérieurs', 'Terrasse'): '18',
    ('Extérieurs', 'Allées / accès'): '18',
}

PRODUCT_LOTS: dict[tuple[str, str, str], str] = {
    ('Viabilisation', 'Assainissement', 'Ventilation vide sanitaire'): '02',
    ('Menuiseries', 'Fenêtres', 'Portes intérieures'): '11',
    ('Second œuvre', 'Électricité', 'Réseau KNX'): '23',
    ('Second œuvre', 'Électricité', 'Installation Photovoltaique'): '21',
    ('Finitions', 'Sols', 'Carrelage'): '15',
    ('Finitions', 'Sols', 'Colle'): '15',
    ('Finitions', 'Sols', 'Parquet'): '16',
    ('Finitions', 'Sols', 'Sous-couche'): '16',
    ('Finitions', 'Sols', 'Plinthes'): '16',
    ('Finitions', 'Murs & plafonds', 'Carrelage mural'): '15',
}

DIY_NOTE = 'Ancienne estimation DIY, convertie en devis lors du passage aux lots.'
TITLE_MAX_LENGTH = 255


def _key(value: str) -> str:
    return unicodedata.normalize('NFC', value).strip().casefold()


_SUBCATEGORY_LOTS = {
    (_key(category), _key(subcategory)): code
    for (category, subcategory), code in SUBCATEGORY_LOTS.items()
}
_PRODUCT_LOTS = {
    (_key(category), _key(subcategory), _key(product)): code
    for (category, subcategory, product), code in PRODUCT_LOTS.items()
}


def lot_code_for(category: str, subcategory: str, product: str) -> str | None:
    """The Appendix B lot code of a catalog product, or None if unmapped."""
    product_key = (_key(category), _key(subcategory), _key(product))
    if product_key in _PRODUCT_LOTS:
        return _PRODUCT_LOTS[product_key]
    return _SUBCATEGORY_LOTS.get(product_key[:2])


def _count(connection: sa.Connection, sql: str) -> int:
    return int(connection.execute(sa.text(sql)).scalar_one())


def upgrade() -> None:
    """Upgrade schema."""
    connection = op.get_bind()

    # --- New tables -----------------------------------------------------
    lots = op.create_table(
        'lots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('code', sa.String(length=10), nullable=False),
        sa.Column('designation', sa.String(length=120), nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column(
            'created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False
        ),
        sa.Column(
            'updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_lots_id'), 'lots', ['id'], unique=False)
    op.create_index(op.f('ix_lots_project_id'), 'lots', ['project_id'], unique=False)
    op.create_index(
        'uq_lots_global_code',
        'lots',
        ['code'],
        unique=True,
        postgresql_where=sa.text('project_id IS NULL'),
    )
    op.create_index(
        'uq_lots_global_designation',
        'lots',
        ['designation'],
        unique=True,
        postgresql_where=sa.text('project_id IS NULL'),
    )
    op.create_index(
        'uq_lots_project_id_code',
        'lots',
        ['project_id', 'code'],
        unique=True,
        postgresql_where=sa.text('project_id IS NOT NULL'),
    )
    op.bulk_insert(
        lots,
        [
            {'code': code, 'designation': designation, 'sort_order': index}
            for index, (code, designation) in enumerate(DEFAULT_LOTS)
        ],
    )

    op.create_table(
        'project_hidden_lots',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('lot_id', sa.Integer(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(['lot_id'], ['lots.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id', 'lot_id'),
    )
    op.create_index(
        op.f('ix_project_hidden_lots_lot_id'),
        'project_hidden_lots',
        ['lot_id'],
        unique=False,
    )

    op.create_table(
        'supplier_lots',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('supplier_id', sa.Integer(), nullable=False),
        sa.Column('lot_id', sa.Integer(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False
        ),
        sa.ForeignKeyConstraint(['lot_id'], ['lots.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id', 'supplier_id', 'lot_id'),
    )
    op.create_index(
        op.f('ix_supplier_lots_lot_id'), 'supplier_lots', ['lot_id'], unique=False
    )
    op.create_index(
        op.f('ix_supplier_lots_supplier_id'),
        'supplier_lots',
        ['supplier_id'],
        unique=False,
    )

    # --- New columns ----------------------------------------------------
    op.add_column(
        'suppliers', sa.Column('rne_number', sa.String(length=50), nullable=True)
    )
    op.add_column('transactions', sa.Column('project_id', sa.Integer(), nullable=True))
    op.add_column('transactions', sa.Column('lot_id', sa.Integer(), nullable=True))
    op.add_column(
        'transactions', sa.Column('title', sa.String(length=255), nullable=True)
    )
    op.add_column(
        'transactions', sa.Column('reference', sa.String(length=100), nullable=True)
    )

    # --- Backfill: project, libellé -------------------------------------
    op.execute(
        sa.text(
            """
            UPDATE transactions AS t
            SET project_id = bl.project_id,
                title = NULLIF(LEFT(BTRIM(bl.name), :title_max), '')
            FROM budget_lines AS bl
            WHERE bl.id = t.budget_line_id
            """
        ).bindparams(title_max=TITLE_MAX_LENGTH)
    )

    # --- Backfill: lot, from the budget line's product (Appendix B) -----
    lot_ids = {
        code: lot_id
        for lot_id, code in connection.execute(
            sa.text('SELECT id, code FROM lots WHERE project_id IS NULL')
        )
    }
    used_products = connection.execute(
        sa.text(
            """
            SELECT DISTINCT p.id, c.name, s.name, p.name
            FROM transactions AS t
            JOIN budget_lines AS bl ON bl.id = t.budget_line_id
            JOIN products AS p ON p.id = bl.product_id
            JOIN subcategories AS s ON s.id = p.subcategory_id
            JOIN categories AS c ON c.id = s.category_id
            ORDER BY c.name, s.name, p.name
            """
        )
    ).all()

    product_lots: dict[int, int] = {}
    unmapped: list[str] = []
    for product_id, category, subcategory, product in used_products:
        code = lot_code_for(category, subcategory, product)
        if code is None:
            unmapped.append(f'{category} › {subcategory} › {product}')
            continue
        product_lots[product_id] = lot_ids[code]

    if unmapped:
        # Stop rather than guess: a wrong lot silently re-categorizes real
        # spending. The whole migration runs in one transaction and rolls
        # back.
        raise RuntimeError(
            'Lots migration stopped: no lot mapping for the products '
            + '; '.join(unmapped)
            + '. Add their sous-catégorie to the mapping (spec Appendix B) '
            'before migrating.'
        )

    for product_id, lot_id in product_lots.items():
        op.execute(
            sa.text(
                """
                UPDATE transactions AS t
                SET lot_id = :lot_id
                FROM budget_lines AS bl
                WHERE bl.id = t.budget_line_id
                  AND bl.product_id = :product_id
                """
            ).bindparams(lot_id=lot_id, product_id=product_id)
        )

    # --- Quotes and DIY estimates: the retained budget becomes status ---
    validated_not_retained = _count(
        connection,
        """
        SELECT count(*) FROM transactions
        WHERE transaction_type = 'quote'
          AND quote_status = 'validated'
          AND NOT is_selected_budget
        """,
    )
    retained_quotes = connection.execute(
        sa.text(
            """
            UPDATE transactions
            SET quote_status = 'validated'
            WHERE transaction_type = 'quote'
              AND is_selected_budget
              AND quote_status IS DISTINCT FROM 'validated'
            """
        )
    ).rowcount
    retained_diy = _count(
        connection,
        """
        SELECT count(*) FROM transactions
        WHERE transaction_type = 'diy_estimate' AND is_selected_budget
        """,
    )
    converted_diy = connection.execute(
        sa.text(
            """
            UPDATE transactions
            SET transaction_type = 'quote',
                quote_status = CASE
                    WHEN is_selected_budget THEN 'validated'::quote_status
                    ELSE 'to_confirm'::quote_status
                END,
                description = CASE
                    WHEN description IS NULL OR BTRIM(description) = '' THEN :note
                    ELSE description || E'\\n\\n' || :note
                END
            WHERE transaction_type = 'diy_estimate'
            """
        ).bindparams(note=DIY_NOTE)
    ).rowcount
    logger.info(
        'Lots migration: %s retained quotes set to validated; %s DIY estimates '
        'converted to quotes (%s validated, %s to confirm); %s validated quotes '
        'that were not retained left unchanged.',
        retained_quotes,
        converted_diy,
        retained_diy,
        converted_diy - retained_diy,
        validated_not_retained,
    )

    # --- Supplier <-> lot assignments -----------------------------------
    op.execute(
        """
        INSERT INTO supplier_lots (project_id, supplier_id, lot_id)
        SELECT DISTINCT project_id, supplier_id, lot_id
        FROM transactions
        WHERE supplier_id IS NOT NULL
        """
    )

    # --- Constraints ----------------------------------------------------
    op.alter_column('transactions', 'project_id', nullable=False)
    op.alter_column('transactions', 'lot_id', nullable=False)
    op.alter_column('transactions', 'budget_line_id', nullable=True)
    op.create_foreign_key(
        op.f('transactions_project_id_fkey'),
        'transactions',
        'projects',
        ['project_id'],
        ['id'],
        ondelete='CASCADE',
    )
    op.create_foreign_key(
        op.f('transactions_lot_id_fkey'), 'transactions', 'lots', ['lot_id'], ['id']
    )
    op.create_index(
        op.f('ix_transactions_project_id'), 'transactions', ['project_id'], unique=False
    )
    op.create_index(
        op.f('ix_transactions_lot_id'), 'transactions', ['lot_id'], unique=False
    )
    op.create_index(
        'ix_transactions_active_project_lot_issued_date_id',
        'transactions',
        ['project_id', 'lot_id', 'issued_date', 'id'],
        unique=False,
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
    op.drop_constraint(
        'ck_transactions_selected_budget_candidate', 'transactions', type_='check'
    )
    op.create_check_constraint(
        'ck_transactions_type_quote_or_invoice',
        'transactions',
        "transaction_type IN ('quote', 'invoice')",
    )


def downgrade() -> None:
    """Downgrade schema.

    Transactions created after the upgrade have no budget line and are
    deleted (with their document rows; their R2 files are left in place).
    The real rollback path is restoring the pre-deploy backup.
    """
    op.drop_constraint(
        'ck_transactions_type_quote_or_invoice', 'transactions', type_='check'
    )
    op.execute('DELETE FROM transactions WHERE budget_line_id IS NULL')

    # Former DIY estimates go back to DIY estimates; is_selected_budget was
    # never changed, so it still says whether they were retained.
    op.execute(
        sa.text(
            """
            UPDATE transactions
            SET transaction_type = 'diy_estimate',
                quote_status = NULL,
                due_date = NULL,
                description = NULLIF(
                    REPLACE(
                        REPLACE(description, E'\\n\\n' || :note, ''),
                        :note,
                        ''
                    ),
                    ''
                )
            WHERE transaction_type = 'quote'
              AND description LIKE '%' || :note
            """
        ).bindparams(note=DIY_NOTE)
    )
    op.execute(
        """
        UPDATE transactions
        SET is_selected_budget = FALSE
        WHERE transaction_type NOT IN ('quote', 'diy_estimate')
        """
    )
    op.create_check_constraint(
        'ck_transactions_selected_budget_candidate',
        'transactions',
        "NOT is_selected_budget OR transaction_type IN ('quote', 'diy_estimate')",
    )

    op.drop_index(
        'ix_transactions_active_project_lot_issued_date_id',
        table_name='transactions',
        postgresql_where=sa.text('deleted_at IS NULL'),
    )
    op.drop_index(op.f('ix_transactions_lot_id'), table_name='transactions')
    op.drop_index(op.f('ix_transactions_project_id'), table_name='transactions')
    op.drop_constraint(
        op.f('transactions_lot_id_fkey'), 'transactions', type_='foreignkey'
    )
    op.drop_constraint(
        op.f('transactions_project_id_fkey'), 'transactions', type_='foreignkey'
    )
    op.alter_column('transactions', 'budget_line_id', nullable=False)
    op.drop_column('transactions', 'reference')
    op.drop_column('transactions', 'title')
    op.drop_column('transactions', 'lot_id')
    op.drop_column('transactions', 'project_id')
    op.drop_column('suppliers', 'rne_number')

    op.drop_index(op.f('ix_supplier_lots_supplier_id'), table_name='supplier_lots')
    op.drop_index(op.f('ix_supplier_lots_lot_id'), table_name='supplier_lots')
    op.drop_table('supplier_lots')
    op.drop_index(
        op.f('ix_project_hidden_lots_lot_id'), table_name='project_hidden_lots'
    )
    op.drop_table('project_hidden_lots')
    op.drop_index(
        'uq_lots_project_id_code',
        table_name='lots',
        postgresql_where=sa.text('project_id IS NOT NULL'),
    )
    op.drop_index(
        'uq_lots_global_designation',
        table_name='lots',
        postgresql_where=sa.text('project_id IS NULL'),
    )
    op.drop_index(
        'uq_lots_global_code',
        table_name='lots',
        postgresql_where=sa.text('project_id IS NULL'),
    )
    op.drop_index(op.f('ix_lots_project_id'), table_name='lots')
    op.drop_index(op.f('ix_lots_id'), table_name='lots')
    op.drop_table('lots')
