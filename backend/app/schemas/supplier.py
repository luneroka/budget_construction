from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


def normalize_siret(value: Any) -> str | None:
    if value is None:
        return None

    if not isinstance(value, str):
        raise ValueError('siret must be a string')

    siret = value.strip()
    if siret == '':
        return None

    if not (len(siret) == 14 and siret.isdigit()):
        raise ValueError('siret must be exactly 14 digits')

    return siret


class SupplierBase(BaseModel):
    name: str
    siret: str | None = None
    email: EmailStr | None = None
    contact_name: str | None = None
    phone_number: str | None = None
    comment: str | None = None

    @field_validator('siret', mode='before')
    @classmethod
    def validate_siret(cls, value: Any) -> str | None:
        return normalize_siret(value)


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: str | None = None
    siret: str | None = None
    email: EmailStr | None = None
    contact_name: str | None = None
    phone_number: str | None = None
    comment: str | None = None

    @field_validator('siret', mode='before')
    @classmethod
    def validate_siret(cls, value: Any) -> str | None:
        return normalize_siret(value)


class SupplierRead(SupplierBase):
    id: int
    user_id: int
    created_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
