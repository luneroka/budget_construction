from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=72)


class UserProfileUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    # Required whenever `email` changes: a stolen session must not be able to
    # move the account to an attacker-controlled address.
    current_password: str | None = Field(default=None, max_length=72)


class AdminUserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    is_active: bool | None = None


class AdminUserCreate(UserBase):
    """Admin-created account: no password, the user sets it via the emailed
    reset link."""


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime | None = None
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AdminUserRead(UserRead):
    is_admin: bool
    is_active: bool
