from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProductBase(BaseModel):
    name: str
    sort_order: int
    is_active: bool


class ProductRead(ProductBase):
    id: int
    subcategory_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductWithHierarchy(ProductRead):
    subcategory_name: str
    category_id: int
    category_name: str
