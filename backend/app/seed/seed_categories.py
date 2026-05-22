import asyncio
from typing import cast

from sqlalchemy import Table, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, engine
from app.models.category import Category


DEFAULT_CATEGORIES = [
    'Terrain & Préparation',
    'Viabilisation',
    'Gros œuvre',
    'Menuiseries',
    'Second œuvre',
    'Finitions',
    'Extérieurs',
]


async def seed_categories(db: AsyncSession) -> tuple[int, int, int]:
    added_count = 0
    existing_count = 0
    updated_count = 0
    category_table = cast(Table, Category.__table__)

    for sort_order, category_name in enumerate(DEFAULT_CATEGORIES, start=1):
        result = await db.execute(
            select(category_table.c.id, category_table.c.sort_order).where(
                category_table.c.name == category_name
            )
        )
        existing_category = result.one_or_none()

        if existing_category is not None:
            category_id, existing_sort_order = existing_category
            existing_count += 1

            if existing_sort_order != sort_order:
                await db.execute(
                    update(category_table)
                    .where(category_table.c.id == category_id)
                    .values(sort_order=sort_order)
                )
                updated_count += 1

            continue

        await db.execute(
            insert(category_table).values(name=category_name, sort_order=sort_order)
        )
        added_count += 1

    if added_count or updated_count:
        await db.commit()

    return added_count, existing_count, updated_count


async def main() -> None:
    async with AsyncSessionLocal() as db:
        added_count, existing_count, updated_count = await seed_categories(db)

    await engine.dispose()

    print(
        'Category seed complete: '
        f'{added_count} added, {updated_count} updated, '
        f'{existing_count} already existed.'
    )


if __name__ == '__main__':
    asyncio.run(main())
