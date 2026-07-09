"""restore validated quote status

Revision ID: f6a7b8c9d0e2
Revises: e4f5a6b7c8d9
Create Date: 2026-07-09 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e2'
down_revision: Union[str, Sequence[str], None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_selected_budget_trigger() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_budget_line_selected_budget_candidates()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.selected_quote_transaction_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1
                    FROM transactions t
                    WHERE t.id = NEW.selected_quote_transaction_id
                      AND t.budget_line_id = NEW.id
                      AND t.transaction_type = 'quote'
                      AND t.quote_status = 'validated'::quote_status
                      AND t.deleted_at IS NULL
                ) THEN
                    RAISE EXCEPTION
                        'selected quote must be an active validated quote on the same budget line';
                END IF;
            END IF;

            IF NEW.selected_diy_estimate_transaction_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1
                    FROM transactions t
                    WHERE t.id = NEW.selected_diy_estimate_transaction_id
                      AND t.budget_line_id = NEW.id
                      AND t.transaction_type = 'diy_estimate'
                      AND t.deleted_at IS NULL
                ) THEN
                    RAISE EXCEPTION
                        'selected DIY estimate must be an active DIY estimate on the same budget line';
                END IF;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )


def upgrade() -> None:
    op.execute(
        "UPDATE transactions "
        "SET quote_status = 'validated'::quote_status "
        "WHERE quote_status::text = 'accepted'"
    )
    _create_selected_budget_trigger()


def downgrade() -> None:
    _create_selected_budget_trigger()
