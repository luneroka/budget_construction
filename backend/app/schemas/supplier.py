from datetime import datetime
from typing import Any, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


def normalize_siret(value: Any) -> str | None:
    if value is None:
        return None

    if not isinstance(value, str):
        raise ValueError('siret must be a string')

    siret = ''.join(str(value).split())
    if siret == '':
        return None

    if not (len(siret) in {9, 14} and siret.isdigit()):
        raise ValueError('siret must be a 9-digit SIREN or 14-digit SIRET')

    return siret


class SupplierContactBase(BaseModel):
    name: str | None = None
    phone_number: str | None = None
    email: EmailStr | None = None
    is_primary: bool = False

    @field_validator('name', 'phone_number', mode='before')
    @classmethod
    def normalize_optional_text(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError('value must be a string')
        normalized = value.strip()
        return normalized or None

    @model_validator(mode='after')
    def validate_not_empty(self) -> Self:
        if self.name is None and self.phone_number is None and self.email is None:
            raise ValueError('a supplier contact needs a name, phone number, or email')
        return self


class SupplierContactCreate(SupplierContactBase):
    pass


class SupplierContactUpdate(SupplierContactBase):
    id: int | None = None


class SupplierContactRead(SupplierContactBase):
    id: int
    supplier_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


def normalize_primary_contact(
    contacts: list[SupplierContactCreate] | list[SupplierContactUpdate],
) -> None:
    if len(contacts) == 1:
        contacts[0].is_primary = True
        return

    primary_count = sum(1 for contact in contacts if contact.is_primary)
    if primary_count != 1:
        raise ValueError('exactly one supplier contact must be marked as primary')


class SupplierBase(BaseModel):
    name: str
    siret: str | None = None
    comment: str | None = None

    @field_validator('siret', mode='before')
    @classmethod
    def validate_siret(cls, value: Any) -> str | None:
        return normalize_siret(value)


class SupplierCreate(SupplierBase):
    contacts: list[SupplierContactCreate] = Field(min_length=1)

    @model_validator(mode='after')
    def validate_contacts(self) -> Self:
        normalize_primary_contact(self.contacts)
        return self


class SupplierUpdate(BaseModel):
    name: str | None = None
    siret: str | None = None
    comment: str | None = None
    contacts: list[SupplierContactUpdate] | None = Field(default=None, min_length=1)

    @field_validator('siret', mode='before')
    @classmethod
    def validate_siret(cls, value: Any) -> str | None:
        return normalize_siret(value)

    @model_validator(mode='after')
    def validate_contacts(self) -> Self:
        if self.contacts is not None:
            normalize_primary_contact(self.contacts)
        return self


class SupplierRead(SupplierBase):
    id: int
    user_id: int
    contacts: list[SupplierContactRead]
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
