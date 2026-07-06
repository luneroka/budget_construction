from re import search
from typing import Never

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

CONSTRAINT_MESSAGES = {
    'uq_projects_user_id_name': 'A project with this name already exists',
    'uq_suppliers_user_id_name': 'A supplier with this name already exists',
    'uq_supplier_contacts_primary_per_supplier': (
        'A supplier can only have one primary contact'
    ),
    'uq_template_name': 'A template with this name already exists',
    'uq_template_items_template_id_product_id': (
        'A template cannot contain the same product more than once'
    ),
    'users_email_key': 'A user with this email already exists',
    'uq_budget_lines_project_id_product_id_product_type': (
        'A whole-product budget line already exists for this project product'
    ),
    'uq_budget_lines_selected_quote_transaction': (
        'This quote is already selected by another budget line'
    ),
    'uq_budget_lines_selected_diy_estimate_transaction': (
        'This DIY estimate is already selected by another budget line'
    ),
}


def _constraint_name(error: IntegrityError) -> str | None:
    candidates: list[BaseException | None] = [
        error.orig,
        getattr(error.orig, '__cause__', None),
        getattr(error.orig, '__context__', None),
    ]

    for candidate in candidates:
        name = getattr(candidate, 'constraint_name', None)
        if isinstance(name, str) and name:
            return name

    message = str(error.orig)
    match = search(r'constraint "([^"]+)"', message)
    if match:
        return match.group(1)

    for constraint_name in CONSTRAINT_MESSAGES:
        if constraint_name in message:
            return constraint_name

    return None


async def raise_integrity_conflict(
    db: AsyncSession,
    error: IntegrityError,
    *,
    default_detail: str = 'Request conflicts with an existing record or database constraint',
) -> Never:
    await db.rollback()
    constraint_name = _constraint_name(error)
    if constraint_name is not None:
        detail = CONSTRAINT_MESSAGES.get(constraint_name, default_detail)
    else:
        detail = default_detail
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=detail,
    ) from error
