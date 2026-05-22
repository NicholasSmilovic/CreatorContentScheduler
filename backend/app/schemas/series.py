from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.post import PostResponse


class SeriesBase(BaseModel):
    name: str
    platform: str
    starts_at: datetime


class SeriesCreate(SeriesBase):
    pass


class SeriesUpdate(BaseModel):
    name: Optional[str] = None
    starts_at: Optional[datetime] = None


class SeriesResponse(SeriesBase):
    id: int
    owner_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SeriesDetailResponse(SeriesResponse):
    posts: list[PostResponse]
