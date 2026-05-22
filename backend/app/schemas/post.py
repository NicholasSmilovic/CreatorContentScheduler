from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PostBase(BaseModel):
    title: str
    platform: str
    scheduled_at: Optional[datetime] = None
    status: str = "draft"


class PostCreate(PostBase):
    series_id: Optional[int] = None
    series_role_label: Optional[str] = None


class PostUpdate(BaseModel):
    title: Optional[str] = None
    platform: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None
    series_id: Optional[int] = None
    series_role_label: Optional[str] = None


class PostSeriesSummary(BaseModel):
    id: int
    name: str
    platform: str
    role_label: Optional[str] = None
    offset_minutes: int

    class Config:
        from_attributes = True


class PostResponse(PostBase):
    id: int
    owner_id: int
    series: Optional[PostSeriesSummary] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
