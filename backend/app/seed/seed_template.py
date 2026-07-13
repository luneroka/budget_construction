import argparse
import asyncio
from dataclasses import dataclass
from typing import cast

from sqlalchemy import Table, insert, join, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, engine
from app.models.category import Category
from app.models.product import Product
from app.models.subcategory import Subcategory
from app.models.template import Template
from app.models.template_item import TemplateItem


TEMPLATE_NAME = 'Maison Plain-Pied'


@dataclass
class SeedStats:
    added: int = 0
    updated: int = 0
    existing: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=f'Seed the "{TEMPLATE_NAME}" template with every active '
        'catalog product.'
    )
    parser.add_argument(
        '--reset',
        action='store_true',
        help='Delete existing items on this template and restart IDs before seeding.',
    )
    return parser.parse_args()


async def _get_or_create_template(db: AsyncSession) -> int:
    template_table = cast(Table, Template.__table__)

    result = await db.execute(
        select(template_table.c.id).where(template_table.c.name == TEMPLATE_NAME)
    )
    existing = result.scalar_one_or_none()

    if existing is not None:
        return existing

    result = await db.execute(
        insert(template_table)
        .values(name=TEMPLATE_NAME, description=None, is_active=True)
        .returning(template_table.c.id)
    )
    return result.scalar_one()


async def _reset_template_items(db: AsyncSession, template_id: int) -> None:
    template_item_table = cast(Table, TemplateItem.__table__)
    await db.execute(
        text(
            f'DELETE FROM {template_item_table.name} '
            'WHERE template_id = :template_id'
        ),
        {'template_id': template_id},
    )


async def seed_template(db: AsyncSession, *, reset: bool = False) -> SeedStats:
    template_item_table = cast(Table, TemplateItem.__table__)
    product_table = cast(Table, Product.__table__)
    subcategory_table = cast(Table, Subcategory.__table__)
    category_table = cast(Table, Category.__table__)

    stats = SeedStats()

    template_id = await _get_or_create_template(db)

    if reset:
        await _reset_template_items(db, template_id)

    catalog_join = join(
        product_table,
        subcategory_table,
        product_table.c.subcategory_id == subcategory_table.c.id,
    ).join(
        category_table,
        subcategory_table.c.category_id == category_table.c.id,
    )

    result = await db.execute(
        select(product_table.c.id, product_table.c.name)
        .select_from(catalog_join)
        .where(
            product_table.c.is_active.is_(True),
            subcategory_table.c.is_active.is_(True),
            category_table.c.is_active.is_(True),
        )
        .order_by(
            category_table.c.sort_order,
            subcategory_table.c.sort_order,
            product_table.c.sort_order,
        )
    )
    products = result.all()

    for sort_order, (product_id, product_name) in enumerate(products):
        result = await db.execute(
            select(
                template_item_table.c.id,
                template_item_table.c.default_name,
                template_item_table.c.sort_order,
            ).where(
                template_item_table.c.template_id == template_id,
                template_item_table.c.product_id == product_id,
            )
        )
        existing_item = result.one_or_none()

        if existing_item is None:
            await db.execute(
                insert(template_item_table).values(
                    template_id=template_id,
                    product_id=product_id,
                    default_name=product_name,
                    sort_order=sort_order,
                    is_required=True,
                )
            )
            stats.added += 1
            continue

        item_id, existing_name, existing_sort_order = existing_item
        stats.existing += 1

        if existing_name != product_name or existing_sort_order != sort_order:
            await db.execute(
                update(template_item_table)
                .where(template_item_table.c.id == item_id)
                .values(default_name=product_name, sort_order=sort_order)
            )
            stats.updated += 1

    if reset or stats.added or stats.updated:
        await db.commit()

    return stats


async def main() -> None:
    args = parse_args()

    async with AsyncSessionLocal() as db:
        stats = await seed_template(db, reset=args.reset)

    await engine.dispose()

    if args.reset:
        print(f'"{TEMPLATE_NAME}" template items reset.')

    print(
        f'"{TEMPLATE_NAME}" template seed complete: '
        f'{stats.added} added, {stats.updated} updated, '
        f'{stats.existing} already existed.'
    )


if __name__ == '__main__':
    asyncio.run(main())
