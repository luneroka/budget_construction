"""Query fragments shared by several repositories and services.

Ownership and "is this still active" rules live here once, so a change to
them (say, project sharing, or archived categories staying visible) is made
in one place.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sqlalchemy.orm.attributes import InstrumentedAttribute

from app.models.category import Category
from app.models.product import Product
from app.models.project import Project
from app.models.subcategory import Subcategory


async def get_active_project(
    db: AsyncSession, project_id: int, user_id: int
) -> Project | None:
    """The project if it exists, belongs to the user and is not soft-deleted."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,
            Project.deleted_at.is_(None),
        )
    )

    return result.scalar_one_or_none()


async def get_active_product(db: AsyncSession, product_id: int) -> Product | None:
    """The product if it and its whole subcategory/category chain are active."""
    result = await db.execute(
        select(Product)
        .join(Subcategory, Product.subcategory_id == Subcategory.id)
        .join(Category, Subcategory.category_id == Category.id)
        .where(
            Product.id == product_id,
            Product.is_active.is_(True),
            Subcategory.is_active.is_(True),
            Category.is_active.is_(True),
        )
    )

    return result.scalar_one_or_none()


def with_product_hierarchy(product_relationship: InstrumentedAttribute[Product]):
    """Eager-load ``<owner>.product -> subcategory -> category`` in one query.

    ``product_relationship`` is the owner's relationship attribute, e.g.
    ``BudgetLine.product`` or ``TemplateItem.product``.
    """
    return (
        joinedload(product_relationship)
        .joinedload(Product.subcategory)
        .joinedload(Subcategory.category)
    )
