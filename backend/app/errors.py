from typing import Never, NotRequired, TypedDict, cast

from fastapi import HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorDefinition(TypedDict):
    message: str
    field: NotRequired[str]


class ErrorDetail(TypedDict):
    code: str
    message: str
    field: NotRequired[str]
    context: NotRequired[dict[str, object]]


ERROR_DEFINITIONS: dict[str, ErrorDefinition] = {
    'admin_access_required': {
        'message': 'Admin access required',
    },
    'amount_ht_invalid': {
        'message': 'amount_ht must be greater than or equal to 0',
        'field': 'amount_ht',
    },
    'amount_ttc_invalid': {
        'message': 'amount_ttc must be greater than or equal to 0',
        'field': 'amount_ttc',
    },
    'amount_ttc_mismatch': {
        'message': 'amount_ttc does not match amount_ht and amount_vat',
        'field': 'amount_ttc',
    },
    'amount_ttc_required': {
        'message': 'amount_ttc is required when vat_rate and amount_vat are not provided',
        'field': 'amount_ttc',
    },
    'amount_vat_invalid': {
        'message': 'amount_vat must be greater than or equal to 0',
        'field': 'amount_vat',
    },
    'amount_vat_mismatch': {
        'message': 'amount_vat does not match amount_ht and vat_rate',
        'field': 'amount_vat',
    },
    'budget_line_item_mode_conflict': {
        'message': (
            'A project product must use either one whole-product budget item or '
            'multiple breakdown items, not both'
        ),
    },
    'budget_line_name_required': {
        'message': 'Budget line name is required',
        'field': 'name',
    },
    'budget_line_not_found': {
        'message': 'Budget line not found',
    },
    'budget_line_type_required': {
        'message': 'Budget line type is required',
        'field': 'item_type',
    },
    'breakdown_names_duplicate': {
        'message': 'Breakdown names must be unique',
        'field': 'new_breakdown_names',
    },
    'breakdown_name_conflict': {
        'message': 'Breakdown name already exists for this product',
        'field': 'new_breakdown_names',
    },
    'budget_transaction_already_selected': {
        'message': 'This budget transaction is already selected by another budget line',
    },
    'conversion_existing_line_name_not_allowed': {
        'message': 'existing_line_new_name is only allowed when reusing the existing line',
        'field': 'existing_line_new_name',
    },
    'conversion_strategy_required': {
        'message': 'Conversion strategy is required when the budget line has transactions',
        'field': 'strategy',
    },
    'category_not_found': {
        'message': 'Category not found',
    },
    'credentials_invalid': {
        'message': 'Could not validate credentials',
    },
    'document_delete_failed': {
        'message': 'Failed to delete document file',
    },
    'document_metadata_save_failed': {
        'message': 'Failed to save document metadata',
    },
    'document_must_be_deleted_before_permanent_delete': {
        'message': 'Document must be deleted before permanent deletion',
    },
    'document_not_found': {
        'message': 'Document not found',
    },
    'document_parent_supplier_restore_required': {
        'message': 'Restore the parent supplier first',
    },
    'document_parent_transaction_restore_required': {
        'message': 'Restore the parent transaction first',
    },
    'document_upload_failed': {
        'message': 'Failed to upload document',
    },
    'due_date_before_issued_date': {
        'message': 'due_date must be greater than or equal to issued_date',
        'field': 'due_date',
    },
    'due_date_not_allowed': {
        'message': 'due_date is only allowed for quote and invoice transactions',
        'field': 'due_date',
    },
    'email_already_exists': {
        'message': 'A user with this email already exists',
        'field': 'email',
    },
    'file_content_invalid': {
        'message': 'Unsupported or invalid file content',
        'field': 'file',
    },
    'file_empty': {
        'message': 'File is empty',
        'field': 'file',
    },
    'file_extension_missing': {
        'message': 'Missing file extension',
        'field': 'file',
    },
    'file_extension_mismatch': {
        'message': 'File extension does not match file content',
        'field': 'file',
    },
    'file_extension_unsupported': {
        'message': 'Unsupported file extension',
        'field': 'file',
    },
    'file_name_missing': {
        'message': 'Missing filename',
        'field': 'file',
    },
    'file_too_large': {
        'message': 'File is too large',
        'field': 'file',
    },
    'inactive_user': {
        'message': 'Inactive user',
    },
    'invoice_status_not_allowed': {
        'message': 'invoice_status is only allowed for invoice transactions',
        'field': 'invoice_status',
    },
    'invoice_status_required': {
        'message': 'invoice_status is required for invoices',
        'field': 'invoice_status',
    },
    'invoice_type_not_allowed': {
        'message': 'invoice_type is only allowed for invoice transactions',
        'field': 'invoice_type',
    },
    'invoice_type_required': {
        'message': 'invoice_type is required for invoices',
        'field': 'invoice_type',
    },
    'last_admin_delete_forbidden': {
        'message': 'Cannot delete the last admin user',
    },
    'last_admin_deactivate_forbidden': {
        'message': 'Cannot deactivate the last admin user',
    },
    'not_authenticated': {
        'message': 'Not authenticated',
    },
    'password_reset_token_invalid': {
        'message': 'Invalid or expired token',
        'field': 'token',
    },
    'payment_date_before_issued_date': {
        'message': 'payment_date must be greater than or equal to issued_date',
        'field': 'payment_date',
    },
    'payment_date_not_allowed': {
        'message': 'payment_date is only allowed for invoice transactions',
        'field': 'payment_date',
    },
    'payment_date_requires_paid_invoice': {
        'message': 'payment_date is only allowed when invoice_status is paid',
        'field': 'payment_date',
    },
    'payment_date_required': {
        'message': 'payment_date is required for paid invoices',
        'field': 'payment_date',
    },
    'payment_method_not_allowed': {
        'message': 'payment_method is only allowed for invoice transactions',
        'field': 'payment_method',
    },
    'product_not_available_in_template': {
        'message': "Product is not available in this project's template",
        'field': 'product_id',
    },
    'product_not_found': {
        'message': 'Product not found',
    },
    'product_not_found_or_inactive': {
        'message': 'Product not found or inactive',
        'field': 'product_id',
    },
    'product_already_budgeted_with_breakdowns': {
        'message': 'Product is already budgeted with breakdown lines',
        'field': 'product_id',
    },
    'product_budget_line_missing': {
        'message': 'No active budget line exists for this product',
        'field': 'product_id',
    },
    'product_budget_line_ambiguous': {
        'message': 'Select a specific budget line for this product transaction',
        'field': 'budget_line_id',
    },
    'product_breakdown_name_required': {
        'message': 'At least one breakdown name is required',
        'field': 'new_breakdown_names',
    },
    'product_line_not_found': {
        'message': 'Whole-product budget line not found',
        'field': 'product_id',
    },
    'project_already_has_template': {
        'message': 'This project already has an associated template',
        'field': 'template_id',
    },
    'project_date_range_invalid': {
        'message': 'end_date must be greater than or equal to start_date',
        'field': 'end_date',
    },
    'project_missing_template': {
        'message': 'Cannot create budget lines because this project has no template',
        'field': 'template_id',
    },
    'project_name_conflict': {
        'message': 'A project with this name already exists',
        'field': 'name',
    },
    'project_not_found': {
        'message': 'Project not found',
    },
    'project_status_required': {
        'message': 'project_status cannot be null',
        'field': 'project_status',
    },
    'quote_status_not_allowed': {
        'message': 'quote_status is only allowed for quote transactions',
        'field': 'quote_status',
    },
    'quote_status_required': {
        'message': 'quote_status is required for quotes',
        'field': 'quote_status',
    },
    'request_conflict': {
        'message': 'Request conflicts with an existing record or database constraint',
    },
    'request_validation_failed': {
        'message': 'Request validation failed',
    },
    'selected_budget_quote_must_be_validated': {
        'message': 'Only validated quotes can be selected as budget candidates',
        'field': 'select_as_budget',
    },
    'selected_budget_quote_status_locked': {
        'message': 'A selected budget quote must remain validated',
        'field': 'quote_status',
    },
    'self_delete_endpoint_required': {
        'message': 'Use self-delete endpoint',
    },
    'self_service_endpoint_required': {
        'message': 'Use self-service endpoint',
    },
    'subcategory_not_found': {
        'message': 'Subcategory not found',
    },
    'supplier_name_conflict': {
        'message': 'A supplier with this name already exists',
        'field': 'name',
    },
    'supplier_not_found': {
        'message': 'Supplier not found',
    },
    'supplier_not_found_or_inactive': {
        'message': 'Supplier not found or inactive',
        'field': 'supplier_id',
    },
    'template_item_not_found': {
        'message': 'Template item not found',
    },
    'template_name_conflict': {
        'message': 'A template with this name already exists',
        'field': 'name',
    },
    'template_not_found': {
        'message': 'Template not found',
    },
    'template_not_found_or_inactive': {
        'message': 'Template not found or inactive',
        'field': 'template_id',
    },
    'template_product_duplicate': {
        'message': 'A template cannot contain the same product more than once',
        'field': 'product_id',
    },
    'template_whole_product_duplicate': {
        'message': 'A template cannot create more than one whole-product item for the same product',
        'field': 'product_id',
    },
    'transaction_not_found': {
        'message': 'Transaction not found',
    },
    'user_email_conflict': {
        'message': 'A user with this email already exists',
        'field': 'email',
    },
    'user_must_be_deleted_before_permanent_delete': {
        'message': 'User must be deleted before permanent deletion',
    },
    'user_not_deleted': {
        'message': 'User is not deleted',
    },
    'user_not_found': {
        'message': 'User not found',
    },
    'vat_rate_invalid': {
        'message': 'vat_rate must be greater than or equal to 0',
        'field': 'vat_rate',
    },
}


MESSAGE_TO_CODE: dict[str, str] = {
    definition['message']: code for code, definition in ERROR_DEFINITIONS.items()
}

DEFAULT_ERROR_CODE_BY_STATUS: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: 'bad_request',
    status.HTTP_401_UNAUTHORIZED: 'unauthorized',
    status.HTTP_403_FORBIDDEN: 'forbidden',
    status.HTTP_404_NOT_FOUND: 'not_found',
    status.HTTP_409_CONFLICT: 'request_conflict',
    status.HTTP_422_UNPROCESSABLE_CONTENT: 'request_validation_failed',
    status.HTTP_500_INTERNAL_SERVER_ERROR: 'internal_server_error',
    status.HTTP_502_BAD_GATEWAY: 'external_service_error',
}

DEFAULT_ERROR_MESSAGE_BY_STATUS: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: 'Bad request',
    status.HTTP_401_UNAUTHORIZED: 'Unauthorized',
    status.HTTP_403_FORBIDDEN: 'Forbidden',
    status.HTTP_404_NOT_FOUND: 'Not found',
    status.HTTP_409_CONFLICT: ERROR_DEFINITIONS['request_conflict']['message'],
    status.HTTP_422_UNPROCESSABLE_CONTENT: ERROR_DEFINITIONS[
        'request_validation_failed'
    ]['message'],
    status.HTTP_500_INTERNAL_SERVER_ERROR: 'Internal server error',
    status.HTTP_502_BAD_GATEWAY: 'External service error',
}


def error_detail(
    code: str,
    *,
    message: str | None = None,
    field: str | None = None,
    context: dict[str, object] | None = None,
) -> ErrorDetail:
    definition = ERROR_DEFINITIONS.get(code)
    detail: ErrorDetail = {
        'code': code,
        'message': message
        or (definition['message'] if definition is not None else code),
    }

    resolved_field = field or (
        definition.get('field') if definition is not None else None
    )
    if resolved_field is not None:
        detail['field'] = resolved_field
    if context:
        detail['context'] = context

    return detail


def raise_api_error(
    status_code: int,
    code: str,
    *,
    message: str | None = None,
    field: str | None = None,
    context: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> Never:
    raise HTTPException(
        status_code=status_code,
        detail=error_detail(code, message=message, field=field, context=context),
        headers=headers,
    )


def normalize_error_detail(detail: object, status_code: int) -> ErrorDetail:
    if isinstance(detail, dict):
        detail_dict = cast(dict[str, object], detail)
        if isinstance(detail_dict.get('code'), str):
            return cast(ErrorDetail, detail_dict)

    if isinstance(detail, str):
        code = MESSAGE_TO_CODE.get(
            detail, DEFAULT_ERROR_CODE_BY_STATUS.get(status_code, 'error')
        )
        return error_detail(code, message=detail)

    code = DEFAULT_ERROR_CODE_BY_STATUS.get(status_code, 'error')
    message = DEFAULT_ERROR_MESSAGE_BY_STATUS.get(status_code, 'Unexpected error')
    return error_detail(code, message=message, context={'detail': detail})


def _validation_error_field(loc: object) -> str:
    if isinstance(loc, (list, tuple)):
        parts = cast(list[object] | tuple[object, ...], loc)
        return '.'.join(str(part) for part in parts)

    return str(loc)


def validation_error_detail(exc: RequestValidationError) -> ErrorDetail:
    errors: list[dict[str, str]] = []
    raw_errors = cast(list[dict[str, object]], exc.errors())
    for error in raw_errors:
        loc = error.get('loc', ())
        field = _validation_error_field(loc)
        errors.append(
            {
                'field': field,
                'message': str(error.get('msg', 'Invalid value')),
                'type': str(error.get('type', 'value_error')),
            }
        )

    first_field = errors[0]['field'] if errors else None
    return error_detail(
        'request_validation_failed',
        field=first_field,
        context={'errors': errors},
    )


async def http_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    return JSONResponse(
        status_code=exc.status_code,
        content={'detail': normalize_error_detail(exc.detail, exc.status_code)},
        headers=exc.headers,
    )


async def request_validation_exception_handler(
    _request: Request, exc: Exception
) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content=jsonable_encoder({'detail': validation_error_detail(exc)}),
    )
