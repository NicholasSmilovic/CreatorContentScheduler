from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.database import get_db
from app.core.series_schedule import calculate_offset_minutes
from app.models.post import Post
from app.models.series import ContentSeries, SeriesPost
from app.schemas.post import PostCreate, PostUpdate, PostResponse

router = APIRouter(prefix="/posts", tags=["posts"])


async def get_owned_series(
    series_id: int,
    db: AsyncSession,
    user_id: int,
) -> ContentSeries:
    result = await db.execute(
        select(ContentSeries).where(ContentSeries.id == series_id, ContentSeries.owner_id == user_id)
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Series not found")
    return series


def validate_series_schedule(scheduled_at, has_series: bool):
    if has_series and scheduled_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Series posts must have a scheduled time",
        )


def validate_series_platform(post_platform: str, series: ContentSeries):
    if post_platform != series.platform:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Series posts must use the series platform",
        )


@router.get("", response_model=list[PostResponse])
async def list_posts(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    status: Optional[str] = Query(None, description="Filter by status"),
    platform: Optional[str] = Query(None, description="Filter by platform"),
):
    q = select(Post).where(Post.owner_id == user_id).order_by(Post.scheduled_at.desc().nulls_last(), Post.created_at.desc())
    if status:
        q = q.where(Post.status == status)
    if platform:
        q = q.where(Post.platform == platform)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    data: PostCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    validate_series_schedule(data.scheduled_at, data.series_id is not None)
    if data.series_id is None and data.series_role_label:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Series role label requires series membership",
        )

    series = None
    if data.series_id is not None:
        series = await get_owned_series(data.series_id, db, user_id)
    post = Post(
        title=data.title,
        platform=series.platform if series else data.platform,
        scheduled_at=data.scheduled_at,
        status=data.status,
        owner_id=user_id,
    )
    db.add(post)
    if series is not None:
        post.series_membership = SeriesPost(
            series=series,
            role_label=data.series_role_label,
            offset_minutes=calculate_offset_minutes(data.scheduled_at, series.starts_at),
        )
    await db.commit()
    await db.refresh(post)
    return post


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    result = await db.execute(select(Post).where(Post.id == post_id, Post.owner_id == user_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


@router.patch("/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: int,
    data: PostUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    result = await db.execute(select(Post).where(Post.id == post_id, Post.owner_id == user_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")

    changes = data.model_dump(exclude_unset=True)
    series_id_changed = "series_id" in changes
    role_changed = "series_role_label" in changes
    requested_series_id = changes.pop("series_id", None)
    requested_role = changes.pop("series_role_label", None)
    final_scheduled_at = changes.get("scheduled_at", post.scheduled_at)
    final_platform = changes.get("platform", post.platform)
    membership = post.series_membership

    if series_id_changed and requested_series_id is None:
        if membership:
            await db.delete(membership)
            post.series_membership = None
            membership = None
    elif series_id_changed:
        validate_series_schedule(final_scheduled_at, True)
        series = await get_owned_series(requested_series_id, db, user_id)
        validate_series_platform(final_platform, series)
        if membership:
            membership.series = series
        else:
            membership = SeriesPost(series=series, post=post, offset_minutes=0)
            db.add(membership)

    if membership:
        validate_series_schedule(final_scheduled_at, True)
        validate_series_platform(final_platform, membership.series)
    elif role_changed and requested_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Series role label requires series membership",
        )

    for k, v in changes.items():
        setattr(post, k, v)

    membership = post.series_membership or membership
    if membership:
        if role_changed:
            membership.role_label = requested_role
        membership.offset_minutes = calculate_offset_minutes(post.scheduled_at, membership.series.starts_at)

    await db.commit()
    await db.refresh(post)
    return post


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    result = await db.execute(select(Post).where(Post.id == post_id, Post.owner_id == user_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    await db.delete(post)
    await db.commit()
