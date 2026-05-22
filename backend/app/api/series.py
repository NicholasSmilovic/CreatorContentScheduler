from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.database import get_db
from app.core.series_schedule import scheduled_from_offset
from app.models.series import ContentSeries
from app.schemas.series import SeriesCreate, SeriesDetailResponse, SeriesResponse, SeriesUpdate

router = APIRouter(prefix="/series", tags=["series"])


def serialize_detail(series: ContentSeries):
    posts = []
    for membership in series.memberships:
        post = membership.post
        posts.append(
            {
                "id": post.id,
                "title": post.title,
                "platform": post.platform,
                "scheduled_at": post.scheduled_at,
                "status": post.status,
                "owner_id": post.owner_id,
                "created_at": post.created_at,
                "updated_at": post.updated_at,
                "series": {
                    "id": series.id,
                    "name": series.name,
                    "platform": series.platform,
                    "role_label": membership.role_label,
                    "offset_minutes": membership.offset_minutes,
                },
            }
        )
    return {
        "id": series.id,
        "name": series.name,
        "platform": series.platform,
        "starts_at": series.starts_at,
        "owner_id": series.owner_id,
        "created_at": series.created_at,
        "updated_at": series.updated_at,
        "posts": posts,
    }


async def get_owned_series(series_id: int, db: AsyncSession, user_id: int) -> ContentSeries:
    result = await db.execute(
        select(ContentSeries).where(ContentSeries.id == series_id, ContentSeries.owner_id == user_id)
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Series not found")
    return series


@router.get("", response_model=list[SeriesResponse])
async def list_series(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    result = await db.execute(
        select(ContentSeries)
        .where(ContentSeries.owner_id == user_id)
        .order_by(ContentSeries.starts_at.desc(), ContentSeries.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=SeriesResponse, status_code=status.HTTP_201_CREATED)
async def create_series(
    data: SeriesCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    series = ContentSeries(
        name=data.name,
        platform=data.platform,
        starts_at=data.starts_at,
        owner_id=user_id,
    )
    db.add(series)
    await db.commit()
    await db.refresh(series)
    return series


@router.get("/{series_id}", response_model=SeriesDetailResponse)
async def get_series(
    series_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    series = await get_owned_series(series_id, db, user_id)
    return serialize_detail(series)


@router.patch("/{series_id}", response_model=SeriesDetailResponse)
async def update_series(
    series_id: int,
    data: SeriesUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    series = await get_owned_series(series_id, db, user_id)
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes:
        series.name = changes["name"]
    if "starts_at" in changes:
        series.starts_at = changes["starts_at"]
        for membership in series.memberships:
            membership.post.scheduled_at = scheduled_from_offset(
                series.starts_at,
                membership.offset_minutes,
            )

    await db.commit()
    await db.refresh(series)
    return serialize_detail(series)
