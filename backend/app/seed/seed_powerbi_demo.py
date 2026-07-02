from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal, engine
from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.budget_line import BudgetLine
from app.models.subcategory import Subcategory
from app.models.supplier import Supplier
from app.models.transaction import Transaction
from app.repositories import supplier as supplier_repository
from app.repositories import transaction as transaction_repository
from app.repositories import user as user_repository
from app.schemas.project import ProjectFromTemplateCreate
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.schemas.transaction import (
    BudgetConcern,
    TransactionCreate,
    TransactionCreateForProduct,
)
from app.schemas.user import UserCreate
from app.services.generate_project import generate_project_from_template
from app.services.transaction import transaction_service

DEMO_PATH = Path(__file__).parent / 'data' / 'powerbi_demo.json'


@dataclass
class SeedStats:
    users_created: int = 0
    users_reused: int = 0
    suppliers_created: int = 0
    suppliers_updated: int = 0
    suppliers_reused: int = 0
    projects_created: int = 0
    projects_reused: int = 0
    projects_hard_deleted: int = 0
    suppliers_hard_deleted: int = 0
    transactions_created: int = 0


def load_demo_data() -> dict[str, Any]:
    return cast(dict[str, Any], json.loads(DEMO_PATH.read_text(encoding='utf-8')))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Seed the Power BI demo dataset.')
    parser.add_argument(
        '--reset',
        action='store_true',
        help=(
            'Hard-delete existing demo project and demo suppliers before seeding. '
            'The demo user is reused because user emails are globally unique.'
        ),
    )
    parser.add_argument(
        '--cleanup-deleted-only',
        action='store_true',
        help='Hard-delete only previously soft-deleted demo rows, then exit.',
    )
    return parser.parse_args()


async def ensure_demo_user(
    db: AsyncSession,
    user_data: dict[str, Any],
    stats: SeedStats,
) -> int:
    existing_user = await user_repository.get_user_by_email(db, user_data['email'])
    if existing_user is not None:
        updates: dict[str, object] = {}
        if existing_user.name != user_data['name']:
            updates['name'] = user_data['name']
        if existing_user.is_active is not True:
            updates['is_active'] = True

        if updates:
            await user_repository.update_user(db, existing_user.id, updates)

        stats.users_reused += 1
        return existing_user.id

    user_create = UserCreate(
        name=user_data['name'],
        email=user_data['email'],
        password=user_data['password'],
    )
    user = await user_repository.create_user(
        db,
        user_create,
        hash_password(user_create.password),
    )
    stats.users_created += 1
    return user.id


def demo_supplier_identity_sets(
    demo_data: dict[str, Any],
) -> tuple[set[str], set[str]]:
    supplier_names = {supplier['name'] for supplier in demo_data['suppliers']}
    supplier_emails = {
        supplier['email']
        for supplier in demo_data['suppliers']
        if supplier.get('email') is not None
    }
    return supplier_names, supplier_emails


async def hard_delete_demo_entities(
    db: AsyncSession,
    user_id: int,
    demo_data: dict[str, Any],
    stats: SeedStats,
    *,
    include_active: bool,
) -> None:
    project_name = demo_data['project']['name']
    supplier_names, supplier_emails = demo_supplier_identity_sets(demo_data)

    project_query = select(Project.id).where(
        Project.user_id == user_id,
        Project.name == project_name,
    )
    if not include_active:
        project_query = project_query.where(Project.deleted_at.is_not(None))

    result = await db.execute(project_query)
    project_ids = list(result.scalars().all())
    if project_ids:
        await db.execute(delete(Project).where(Project.id.in_(project_ids)))
        stats.projects_hard_deleted += len(project_ids)

    supplier_query = select(Supplier.id).where(
        Supplier.user_id == user_id,
        or_(
            Supplier.name.in_(supplier_names),
            Supplier.email.in_(supplier_emails),
        ),
    )
    if not include_active:
        supplier_query = supplier_query.where(Supplier.deleted_at.is_not(None))

    result = await db.execute(supplier_query)
    supplier_ids = list(result.scalars().all())
    if supplier_ids:
        await db.execute(delete(Supplier).where(Supplier.id.in_(supplier_ids)))
        stats.suppliers_hard_deleted += len(supplier_ids)

    if project_ids or supplier_ids:
        await db.commit()


async def find_active_supplier(
    db: AsyncSession,
    user_id: int,
    supplier_data: dict[str, Any],
) -> Supplier | None:
    result = await db.execute(
        select(Supplier).where(
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_(None),
            Supplier.name == supplier_data['name'],
        )
    )
    supplier = result.scalar_one_or_none()
    if supplier is not None or supplier_data.get('email') is None:
        return supplier

    result = await db.execute(
        select(Supplier).where(
            Supplier.user_id == user_id,
            Supplier.deleted_at.is_(None),
            Supplier.email == supplier_data['email'],
        )
    )
    return result.scalars().first()


def supplier_payload(supplier_data: dict[str, Any]) -> dict[str, Any]:
    return {
        'name': supplier_data['name'],
        'siret': supplier_data.get('siret'),
        'email': supplier_data.get('email'),
        'contact_name': supplier_data.get('contact_name'),
        'phone_number': supplier_data.get('phone_number'),
        'comment': supplier_data.get('comment'),
    }


async def ensure_demo_suppliers(
    db: AsyncSession,
    user_id: int,
    suppliers_data: list[dict[str, Any]],
    stats: SeedStats,
) -> dict[str, int]:
    supplier_ids: dict[str, int] = {}

    for supplier_data in suppliers_data:
        existing_supplier = await find_active_supplier(db, user_id, supplier_data)
        payload = supplier_payload(supplier_data)

        if existing_supplier is None:
            supplier = await supplier_repository.create_supplier(
                db, SupplierCreate(**payload), user_id
            )
            stats.suppliers_created += 1
            supplier_ids[supplier_data['key']] = supplier.id
            continue

        updates = {
            key: value
            for key, value in payload.items()
            if getattr(existing_supplier, key) != value
        }
        if updates:
            supplier = await supplier_repository.update_supplier(
                db,
                existing_supplier.id,
                SupplierUpdate(**updates),
                user_id,
            )
            assert supplier is not None
            stats.suppliers_updated += 1
            supplier_ids[supplier_data['key']] = supplier.id
            continue

        stats.suppliers_reused += 1
        supplier_ids[supplier_data['key']] = existing_supplier.id

    return supplier_ids


async def find_active_project(
    db: AsyncSession,
    user_id: int,
    project_name: str,
) -> Project | None:
    result = await db.execute(
        select(Project).where(
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
            Project.name == project_name,
        )
    )
    return result.scalar_one_or_none()


async def count_project_transactions(db: AsyncSession, project_id: int) -> int:
    result = await db.execute(
        select(func.count(Transaction.id))
        .join(BudgetLine, Transaction.budget_line_id == BudgetLine.id)
        .where(
            BudgetLine.project_id == project_id,
            BudgetLine.deleted_at.is_(None),
            Transaction.deleted_at.is_(None),
        )
    )
    return int(result.scalar_one())


async def ensure_demo_project(
    db: AsyncSession,
    user_id: int,
    project_data: dict[str, Any],
    stats: SeedStats,
) -> Project:
    existing_project = await find_active_project(db, user_id, project_data['name'])
    if existing_project is not None:
        stats.projects_reused += 1
        return existing_project

    source_template = project_data['source_template']
    project_create = ProjectFromTemplateCreate(
        template_id=source_template['id'],
        name=project_data['name'],
        description=project_data.get('description'),
        location=project_data.get('location'),
        start_date=project_data.get('start_date'),
        end_date=project_data.get('end_date'),
        project_status=project_data.get('project_status', 'active'),
    )
    generated_project = await generate_project_from_template(
        db,
        project_create,
        user_id,
    )
    await db.commit()
    await db.refresh(generated_project.project)

    stats.projects_created += 1
    return generated_project.project


async def resolve_budget_line_product(
    db: AsyncSession,
    project_id: int,
    budget_line_ref: dict[str, str],
) -> tuple[BudgetLine | None, Product | None]:
    if budget_line_ref['type'] != 'catalog_path':
        raise ValueError(f"Unsupported budget line ref type: {budget_line_ref['type']}")

    result = await db.execute(
        select(BudgetLine, Product)
        .select_from(Product)
        .join(Subcategory, Product.subcategory_id == Subcategory.id)
        .join(Category, Subcategory.category_id == Category.id)
        .outerjoin(
            BudgetLine,
            (BudgetLine.product_id == Product.id)
            & (BudgetLine.project_id == project_id)
            & (BudgetLine.deleted_at.is_(None)),
        )
        .where(
            Category.name == budget_line_ref['category_name'],
            Subcategory.name == budget_line_ref['subcategory_name'],
            Product.name == budget_line_ref['product_name'],
        )
    )
    row = result.first()
    if row is None:
        return None, None
    budget_line, product = row
    return budget_line, product


async def seed_transactions(
    db: AsyncSession,
    project_id: int,
    user_id: int,
    supplier_ids: dict[str, int],
    transaction_groups: list[dict[str, Any]],
    stats: SeedStats,
) -> None:
    missing_products: list[str] = []
    unknown_supplier_keys: set[str] = set()
    resolved_groups: list[tuple[BudgetLine | None, Product, list[dict[str, Any]]]] = []

    for group in transaction_groups:
        budget_line_ref = group['budget_line_ref']
        budget_line, product = await resolve_budget_line_product(
            db, project_id, budget_line_ref
        )
        if product is None:
            missing_products.append(
                ' > '.join(
                    [
                        budget_line_ref['category_name'],
                        budget_line_ref['subcategory_name'],
                        budget_line_ref['product_name'],
                    ]
                )
            )
            continue

        for transaction_data in group['transactions']:
            supplier_key = transaction_data.get('supplier_key')
            if supplier_key is not None and supplier_key not in supplier_ids:
                unknown_supplier_keys.add(str(supplier_key))

        resolved_groups.append((budget_line, product, group['transactions']))

    if missing_products:
        formatted = '\n'.join(f'- {item}' for item in missing_products)
        raise RuntimeError(
            'Some demo transactions could not be matched to catalog products:\n'
            f'{formatted}'
        )

    if unknown_supplier_keys:
        formatted = ', '.join(sorted(unknown_supplier_keys))
        raise RuntimeError(f'Unknown supplier keys in demo transactions: {formatted}')

    for budget_line, product, transactions in resolved_groups:
        for transaction_data in transactions:
            supplier_key = transaction_data.get('supplier_key')
            supplier_id = (
                supplier_ids[supplier_key] if supplier_key is not None else None
            )
            payload = {
                key: value
                for key, value in transaction_data.items()
                if key != 'supplier_key'
            }
            payload['supplier_id'] = supplier_id

            if budget_line is None:
                if payload.get('transaction_type') in {'quote', 'diy_estimate'}:
                    payload['budget_concern'] = BudgetConcern.entire_product
                transaction = (
                    await transaction_service.create_for_product(
                        db,
                        project_id,
                        product.id,
                        TransactionCreateForProduct(**payload),
                        user_id,
                    )
                )
            else:
                transaction = await transaction_repository.create_transaction(
                    db,
                    project_id,
                    budget_line.id,
                    TransactionCreate(**payload),
                    user_id,
                )
            if transaction is None:
                raise RuntimeError(
                    f'Budget line could not be resolved while seeding: {product.name}'
                )
            stats.transactions_created += 1


async def seed_powerbi_demo(db: AsyncSession, *, reset: bool = False) -> SeedStats:
    demo_data = load_demo_data()
    stats = SeedStats()

    user_id = await ensure_demo_user(db, demo_data['user'], stats)

    if reset:
        await hard_delete_demo_entities(
            db,
            user_id,
            demo_data,
            stats,
            include_active=True,
        )
    else:
        await hard_delete_demo_entities(
            db,
            user_id,
            demo_data,
            stats,
            include_active=False,
        )

    supplier_ids = await ensure_demo_suppliers(
        db,
        user_id,
        demo_data['suppliers'],
        stats,
    )
    project = await ensure_demo_project(db, user_id, demo_data['project'], stats)

    existing_transaction_count = await count_project_transactions(db, project.id)
    if existing_transaction_count:
        raise RuntimeError(
            f'Project "{project.name}" already has '
            f'{existing_transaction_count} active transactions. '
            'Run this script with --reset to recreate the demo dataset.'
        )

    await seed_transactions(
        db,
        project.id,
        user_id,
        supplier_ids,
        demo_data['transactions_by_budget_line'],
        stats,
    )

    return stats


async def cleanup_deleted_demo_entities(db: AsyncSession) -> SeedStats:
    demo_data = load_demo_data()
    stats = SeedStats()

    user = await user_repository.get_user_by_email(db, demo_data['user']['email'])
    if user is None:
        return stats

    stats.users_reused += 1
    await hard_delete_demo_entities(
        db,
        user.id,
        demo_data,
        stats,
        include_active=False,
    )
    return stats


async def main() -> None:
    args = parse_args()
    if args.reset and args.cleanup_deleted_only:
        raise SystemExit('--reset and --cleanup-deleted-only cannot be used together.')

    try:
        async with AsyncSessionLocal() as db:
            if args.cleanup_deleted_only:
                stats = await cleanup_deleted_demo_entities(db)
            else:
                stats = await seed_powerbi_demo(db, reset=args.reset)
    finally:
        await engine.dispose()

    if args.cleanup_deleted_only:
        print('Power BI demo cleanup complete:')
        print(f'- users: {stats.users_reused} found')
        print(
            f'- hard-deleted: {stats.projects_hard_deleted} projects, '
            f'{stats.suppliers_hard_deleted} suppliers'
        )
        return

    print('Power BI demo seed complete:')
    print(f'- users: {stats.users_created} created, {stats.users_reused} reused')
    print(
        f'- suppliers: {stats.suppliers_created} created, '
        f'{stats.suppliers_updated} updated, {stats.suppliers_reused} reused'
    )
    print(
        f'- project: {stats.projects_created} created, '
        f'{stats.projects_reused} reused'
    )
    print(f'- transactions: {stats.transactions_created} created')
    if args.reset:
        print(
            f'- reset hard-deleted: {stats.projects_hard_deleted} projects, '
            f'{stats.suppliers_hard_deleted} suppliers'
        )
    elif stats.projects_hard_deleted or stats.suppliers_hard_deleted:
        print(
            f'- stale soft-deleted rows purged: '
            f'{stats.projects_hard_deleted} projects, '
            f'{stats.suppliers_hard_deleted} suppliers'
        )


if __name__ == '__main__':
    asyncio.run(main())
