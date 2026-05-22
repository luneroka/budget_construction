import argparse
import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from sqlalchemy import Table, insert, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, engine
from app.models.category import Category
from app.models.product import Product
from app.models.subcategory import Subcategory


CATALOG_PATH = Path(__file__).parent / 'data' / 'catalog.json'
CATALOG_TABLES = 'products, subcategories, categories'


@dataclass
class SeedStats:
    added: int = 0
    updated: int = 0
    existing: int = 0


def load_catalog() -> list[dict[str, Any]]:
    return cast(
        list[dict[str, Any]],
        json.loads(CATALOG_PATH.read_text(encoding='utf-8')),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Seed the construction catalog.')
    parser.add_argument(
        '--reset',
        action='store_true',
        help='Truncate catalog tables and restart IDs before seeding.',
    )
    return parser.parse_args()


async def reset_catalog_tables(db: AsyncSession) -> None:
    await db.execute(
        text(f'TRUNCATE TABLE {CATALOG_TABLES} RESTART IDENTITY CASCADE')
    )


async def seed_catalog(
    db: AsyncSession, *, reset: bool = False
) -> dict[str, SeedStats]:
    category_table = cast(Table, Category.__table__)
    subcategory_table = cast(Table, Subcategory.__table__)
    product_table = cast(Table, Product.__table__)

    stats = {
        'categories': SeedStats(),
        'subcategories': SeedStats(),
        'products': SeedStats(),
    }

    if reset:
        await reset_catalog_tables(db)

    for category in load_catalog():
        category_name = category['name']
        category_sort_order = int(category['sort_order'])

        result = await db.execute(
            select(
                category_table.c.id,
                category_table.c.sort_order,
                category_table.c.is_active,
            ).where(category_table.c.name == category_name)
        )
        existing_category = result.one_or_none()

        if existing_category is None:
            result = await db.execute(
                insert(category_table)
                .values(
                    name=category_name,
                    sort_order=category_sort_order,
                    is_active=True,
                )
                .returning(category_table.c.id)
            )
            category_id = result.scalar_one()
            stats['categories'].added += 1
        else:
            category_id, existing_sort_order, existing_is_active = existing_category
            stats['categories'].existing += 1

            if (
                existing_sort_order != category_sort_order
                or existing_is_active is not True
            ):
                await db.execute(
                    update(category_table)
                    .where(category_table.c.id == category_id)
                    .values(sort_order=category_sort_order, is_active=True)
                )
                stats['categories'].updated += 1

        for subcategory in category.get('subcategories', []):
            subcategory_name = subcategory['name']
            subcategory_sort_order = int(subcategory['sort_order'])

            result = await db.execute(
                select(
                    subcategory_table.c.id,
                    subcategory_table.c.sort_order,
                    subcategory_table.c.is_active,
                ).where(
                    subcategory_table.c.category_id == category_id,
                    subcategory_table.c.name == subcategory_name,
                )
            )
            existing_subcategory = result.one_or_none()

            if existing_subcategory is None:
                result = await db.execute(
                    insert(subcategory_table)
                    .values(
                        category_id=category_id,
                        name=subcategory_name,
                        sort_order=subcategory_sort_order,
                        is_active=True,
                    )
                    .returning(subcategory_table.c.id)
                )
                subcategory_id = result.scalar_one()
                stats['subcategories'].added += 1
            else:
                (
                    subcategory_id,
                    existing_sort_order,
                    existing_is_active,
                ) = existing_subcategory
                stats['subcategories'].existing += 1

                if (
                    existing_sort_order != subcategory_sort_order
                    or existing_is_active is not True
                ):
                    await db.execute(
                        update(subcategory_table)
                        .where(subcategory_table.c.id == subcategory_id)
                        .values(sort_order=subcategory_sort_order, is_active=True)
                    )
                    stats['subcategories'].updated += 1

            for product in subcategory.get('products', []):
                product_name = product['name']
                product_sort_order = int(product['sort_order'])

                result = await db.execute(
                    select(
                        product_table.c.id,
                        product_table.c.sort_order,
                        product_table.c.is_active,
                    ).where(
                        product_table.c.subcategory_id == subcategory_id,
                        product_table.c.name == product_name,
                    )
                )
                existing_product = result.one_or_none()

                if existing_product is None:
                    await db.execute(
                        insert(product_table).values(
                            subcategory_id=subcategory_id,
                            name=product_name,
                            sort_order=product_sort_order,
                            is_active=True,
                        )
                    )
                    stats['products'].added += 1
                    continue

                product_id, existing_sort_order, existing_is_active = existing_product
                stats['products'].existing += 1

                if (
                    existing_sort_order != product_sort_order
                    or existing_is_active is not True
                ):
                    await db.execute(
                        update(product_table)
                        .where(product_table.c.id == product_id)
                        .values(sort_order=product_sort_order, is_active=True)
                    )
                    stats['products'].updated += 1

    has_changes = any(
        seed_stats.added or seed_stats.updated for seed_stats in stats.values()
    )
    if reset or has_changes:
        await db.commit()

    return stats


async def main() -> None:
    args = parse_args()

    async with AsyncSessionLocal() as db:
        stats = await seed_catalog(db, reset=args.reset)

    await engine.dispose()

    if args.reset:
        print('Catalog tables reset.')

    print('Catalog seed complete:')
    for label, seed_stats in stats.items():
        print(
            f'- {label}: {seed_stats.added} added, '
            f'{seed_stats.updated} updated, '
            f'{seed_stats.existing} already existed.'
        )


if __name__ == '__main__':
    asyncio.run(main())
