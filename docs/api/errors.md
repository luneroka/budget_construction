# API Error Convention

The backend returns structured errors under the FastAPI `detail` key.
The frontend should use `detail.code` as the stable contract and translate the
message in the UI.

```json
{
  "detail": {
    "code": "product_not_found_or_inactive",
    "message": "Product not found or inactive",
    "field": "product_id"
  }
}
```

## Backend Responsibilities

- Return a stable `code` for every expected error.
- Return an English `message` as a fallback for logs, debugging, and API clients.
- Return `field` when the error maps to a specific request field.
- Return `context` only for safe, non-sensitive metadata.
- Keep HTTP status meaningful:
  - `400`: domain or business validation failure.
  - `401`: missing or invalid authentication.
  - `403`: authenticated user is not allowed to perform the action.
  - `404`: resource does not exist or is not visible to the current user.
  - `409`: request conflicts with an existing record or database constraint.
  - `422`: request payload validation failed before domain logic ran.
  - `500` / `502`: server or external service failure.

## Frontend Responsibilities

- Translate errors by `detail.code`, not by `detail.message`.
- Use `detail.message` only as a fallback when a code has no translation yet.
- Use `detail.field` to attach form errors to a specific input when possible.
- Use `detail.context.errors` for request validation errors when field-level detail
  is needed.

Example frontend translation mapping:

```ts
const ERROR_MESSAGES_FR: Record<string, string> = {
  product_not_found_or_inactive: "Ce produit est introuvable ou inactif.",
  project_not_found: "Ce projet est introuvable.",
  request_validation_failed: "Certains champs sont invalides.",
};
```

## Request Validation Errors

Malformed payloads and schema validation failures use the same envelope:

```json
{
  "detail": {
    "code": "request_validation_failed",
    "message": "Request validation failed",
    "field": "body.email",
    "context": {
      "errors": [
        {
          "field": "body.email",
          "message": "value is not a valid email address",
          "type": "value_error"
        }
      ]
    }
  }
}
```

## Adding New Errors

Add new expected errors to `backend/app/errors.py`:

```python
ERROR_DEFINITIONS["project_name_conflict"] = {
    "message": "A project with this name already exists",
    "field": "name",
}
```

For new endpoint code, raise the error by code:

```python
from fastapi import status

from app.errors import raise_api_error

raise_api_error(
    status.HTTP_409_CONFLICT,
    "project_name_conflict",
)
```

Existing `HTTPException(detail="...")` paths are normalized by the global error
handler for compatibility, but new backend code should prefer `raise_api_error`
so the error code is explicit.
