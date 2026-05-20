from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


class SupplierBase(BaseModel):
  name: str
  email: EmailStr | None = None
  contact_name: str | None = None
  phone_number: str | None = None
  comment: str | None = None


class SupplierCreate(SupplierBase):
  pass


class SupplierRead(SupplierBase):
  id: int
  created_at: datetime

  model_config = ConfigDict(from_attributes=True)