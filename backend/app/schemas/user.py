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


class AdminUserUpdate(UserProfileUpdate):
    is_active: bool | None = None


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime | None = None
    deleted_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class AdminUserRead(UserRead):
    is_admin: bool
    is_active: bool
