from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.template import Template
from app.schemas.template import TemplateCreate, TemplateUpdate


async def create_template(
    db: AsyncSession, template_create: TemplateCreate
) -> Template:
    template = Template(**template_create.model_dump())

    db.add(template)
    await db.commit()
    await db.refresh(template)

    return template


async def get_template_by_id(db: AsyncSession, template_id: int) -> Template | None:
    query = select(Template).where(Template.id == template_id)
    result = await db.execute(query)

    return result.scalar_one_or_none()


async def get_template_by_name(db: AsyncSession, template_name: str) -> Template | None:
    query = select(Template).where(Template.name == template_name)
    result = await db.execute(query)

    return result.scalar_one_or_none()


async def get_templates(
    db: AsyncSession, include_inactive: bool = False
) -> Sequence[Template]:
    query = select(Template)

    if not include_inactive:
        query = query.where(Template.is_active.is_(True))

    query = query.order_by(Template.name)

    result = await db.execute(query)

    return result.scalars().all()


async def update_template(
    db: AsyncSession,
    template: Template,
    template_update: TemplateUpdate,
) -> Template:
    update_data = template_update.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(template, key, value)

    await db.commit()
    await db.refresh(template)

    return template


async def deactivate_template(
    db: AsyncSession,
    template: Template,
) -> Template:
    template.is_active = False

    await db.commit()
    await db.refresh(template)

    return template
