from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.repositories import transaction as transaction_repository
from app.schemas.transaction import TransactionCreate, TransactionCreateForProduct
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
        budget_line = await budget_line_service.ensure_for_project_product(
            db,
            project_id,
            product_id,
            user_id,
            name=transaction_data.budget_line_name,
            item_type=transaction_data.budget_line_type,
        )
        if budget_line is None:
            return None

        transaction_payload = TransactionCreate(
            **transaction_data.model_dump(exclude={'budget_line_name', 'budget_line_type'})
        )

        return await transaction_repository.create_transaction(
            db,
            project_id,
            budget_line.id,
            transaction_payload,
            user_id,
        )


transaction_service = TransactionService()
