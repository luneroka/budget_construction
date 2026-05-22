from datetime import datetime

from pydantic import BaseModel


class CatalogProductRead(BaseModel):
    id: int
    name: str
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CatalogSubcategoryRead(BaseModel):
    id: int
    name: str
    sort_order: int
    is_active: bool
    products: list[CatalogProductRead]


class CatalogCategoryRead(BaseModel):
    id: int
    name: str
    sort_order: int
    is_active: bool
    subcategories: list[CatalogSubcategoryRead]
