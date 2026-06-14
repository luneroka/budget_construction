from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.budget_line import BudgetLineType
from app.models.transaction import Transaction, TransactionType
from app.repositories import transaction as transaction_repository
from app.schemas.transaction import (
    BudgetConcern,
    TransactionCreate,
    TransactionCreateForProduct,
)
from app.services.budget_line import budget_line_service


@dataclass(frozen=True)
class TransactionService:
    async def create_for_product(
        self,
        db: AsyncSession,
        project_id: int,
        product_id: int,
        transaction_data: TransactionCreateForProduct,
        user_id: int,
    ) -> Transaction | None:
        budget_transaction_types = {
            TransactionType.quote,
            TransactionType.diy_estimate,
        }
        if transaction_data.transaction_type in budget_transaction_types:
            budget_line_type = (
                BudgetLineType.product
                if transaction_data.budget_concern == BudgetConcern.entire_product
                else BudgetLineType.breakdown
            )
            budget_line = await budget_line_service.ensure_for_project_product(
                db,
                project_id,
                product_id,
                user_id,
                name=transaction_data.budget_line_name,
                item_type=budget_line_type,
            )
        elif transaction_data.transaction_type == TransactionType.invoice:
            budget_line = (
                await budget_line_service.ensure_for_project_product_invoice_transaction(
                    db,
                    project_id,
                    product_id,
                    user_id,
                )
            )
        else:
            budget_line = (
                await budget_line_service.find_single_for_project_product_transaction(
                    db,
                    project_id,
                    product_id,
                    user_id,
                )
            )

        if budget_line is None:
            return None

        transaction_payload = TransactionCreate(
            **transaction_data.model_dump(exclude={'budget_line_name', 'budget_concern'})
        )

        return await transaction_repository.create_transaction(
            db,
            project_id,
            budget_line.id,
            transaction_payload,
            user_id,
        )


transaction_service = TransactionService()
