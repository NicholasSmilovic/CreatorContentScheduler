from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import set_committed_value

from app.models.post import Post
from app.models.series import ContentSeries, SeriesPost


MIN_PLATFORM_SPACING_MINUTES = 15
PLATFORM_SPACING_ERROR = "Posts on the same platform must be at least 15 minutes apart"


def normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def calculate_offset_minutes(scheduled_at: datetime, starts_at: datetime) -> int:
    seconds = (normalize_datetime(scheduled_at) - normalize_datetime(starts_at)).total_seconds()
    return round(seconds / 60)


def scheduled_from_offset(starts_at: datetime, offset_minutes: int) -> datetime:
    return starts_at + timedelta(minutes=offset_minutes)


def sorted_memberships(series: ContentSeries) -> list[SeriesPost]:
    return sorted(
        series.memberships,
        key=lambda membership: (
            membership.position or 0,
            normalize_datetime(membership.post.scheduled_at) if membership.post.scheduled_at else datetime.max,
            membership.post_id or 0,
        ),
    )


def _is_before_or_equal(first: datetime, second: datetime) -> bool:
    return normalize_datetime(first) <= normalize_datetime(second)


def _is_after_or_equal(first: datetime, second: datetime) -> bool:
    return normalize_datetime(first) >= normalize_datetime(second)


def _minutes_between(first: datetime, second: datetime) -> float:
    seconds = abs((normalize_datetime(first) - normalize_datetime(second)).total_seconds())
    return seconds / 60


def _candidate(post_id: Optional[int], platform: str, scheduled_at: datetime):
    return {"post_id": post_id, "platform": platform, "scheduled_at": scheduled_at}


async def validate_platform_spacing(
    db: AsyncSession,
    user_id: int,
    candidates: list[dict],
    exclude_post_ids: Optional[set[int]] = None,
):
    scheduled_candidates = [
        candidate for candidate in candidates if candidate.get("scheduled_at") is not None
    ]
    if not scheduled_candidates:
        return

    excluded = exclude_post_ids or set()
    for index, first in enumerate(scheduled_candidates):
        for second in scheduled_candidates[index + 1:]:
            if first["platform"] != second["platform"]:
                continue
            if _minutes_between(first["scheduled_at"], second["scheduled_at"]) < MIN_PLATFORM_SPACING_MINUTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=PLATFORM_SPACING_ERROR,
                )

    platforms = {candidate["platform"] for candidate in scheduled_candidates}
    result = await db.execute(
        select(Post).where(
            Post.owner_id == user_id,
            Post.platform.in_(platforms),
            Post.scheduled_at.is_not(None),
        )
    )
    existing_posts = result.scalars().all()

    for candidate in scheduled_candidates:
        for post in existing_posts:
            if post.id in excluded:
                continue
            if post.platform != candidate["platform"] or post.scheduled_at is None:
                continue
            if _minutes_between(candidate["scheduled_at"], post.scheduled_at) < MIN_PLATFORM_SPACING_MINUTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=PLATFORM_SPACING_ERROR,
                )


async def append_post_to_series(
    db: AsyncSession,
    *,
    post: Post,
    series: ContentSeries,
    scheduled_at: datetime,
    user_id: int,
    role_label: Optional[str] = None,
) -> SeriesPost:
    memberships = sorted_memberships(series)
    candidate = _candidate(post.id, series.platform, scheduled_at)
    exclude_ids = {post.id} if post.id else set()

    if not memberships:
        await validate_platform_spacing(db, user_id, [candidate], exclude_ids)
        series.starts_at = scheduled_at
        membership = SeriesPost(
            series=series,
            post=post,
            position=1,
            offset_minutes=0,
            role_label=role_label,
        )
        post.series_membership = membership
        db.add(membership)
        return membership

    last_membership = memberships[-1]
    if _is_before_or_equal(scheduled_at, last_membership.post.scheduled_at):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Series posts must be scheduled after the current last post",
        )

    await validate_platform_spacing(db, user_id, [candidate], exclude_ids)
    membership = SeriesPost(
        series=series,
        post=post,
        position=(last_membership.position or len(memberships)) + 1,
        offset_minutes=calculate_offset_minutes(scheduled_at, series.starts_at),
        role_label=role_label,
    )
    post.series_membership = membership
    db.add(membership)
    return membership


def validate_member_position_window(series: ContentSeries, membership: SeriesPost, scheduled_at: datetime):
    memberships = sorted_memberships(series)
    index = next(
        (current_index for current_index, current in enumerate(memberships) if current.post_id == membership.post_id),
        -1,
    )
    if index == -1:
        return

    previous_membership = memberships[index - 1] if index > 0 else None
    next_membership = memberships[index + 1] if index + 1 < len(memberships) else None

    if previous_membership and _is_before_or_equal(scheduled_at, previous_membership.post.scheduled_at):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Series posts must stay after the previous post",
        )
    if next_membership and _is_after_or_equal(scheduled_at, next_membership.post.scheduled_at):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Series posts must stay before the next post",
        )


async def shift_series_start(
    db: AsyncSession,
    *,
    series: ContentSeries,
    starts_at: datetime,
    user_id: int,
):
    memberships = sorted_memberships(series)
    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Place the first post to set the series start",
        )

    current_start = series.starts_at or memberships[0].post.scheduled_at
    delta = normalize_datetime(starts_at) - normalize_datetime(current_start)
    proposed_times = {}
    candidates = []
    excluded_ids = set()
    for membership in memberships:
        if membership.position == 1:
            proposed_at = starts_at
        else:
            proposed_at = membership.post.scheduled_at + delta
        proposed_times[membership.post_id] = proposed_at
        excluded_ids.add(membership.post_id)
        candidates.append(_candidate(membership.post_id, series.platform, proposed_at))

    await validate_platform_spacing(db, user_id, candidates, excluded_ids)

    series.starts_at = starts_at
    for membership in memberships:
        membership.post.scheduled_at = proposed_times[membership.post_id]
        membership.offset_minutes = calculate_offset_minutes(membership.post.scheduled_at, starts_at)
    memberships[0].offset_minutes = 0


async def reschedule_series_member(
    db: AsyncSession,
    *,
    membership: SeriesPost,
    scheduled_at: datetime,
    user_id: int,
):
    if membership.position == 1:
        await shift_series_start(
            db,
            series=membership.series,
            starts_at=scheduled_at,
            user_id=user_id,
        )
        return

    validate_member_position_window(membership.series, membership, scheduled_at)
    await validate_platform_spacing(
        db,
        user_id,
        [_candidate(membership.post_id, membership.series.platform, scheduled_at)],
        {membership.post_id},
    )
    membership.post.scheduled_at = scheduled_at
    membership.offset_minutes = calculate_offset_minutes(scheduled_at, membership.series.starts_at)


def compact_series_positions(series: ContentSeries, removed_membership: Optional[SeriesPost] = None):
    removed_key = None
    if removed_membership is not None:
        removed_key = (removed_membership.series_id, removed_membership.post_id)

    memberships = [
        membership for membership in sorted_memberships(series)
        if (membership.series_id, membership.post_id) != removed_key
    ]
    if not memberships:
        series.starts_at = None
        return

    series.starts_at = memberships[0].post.scheduled_at
    for index, membership in enumerate(memberships, start=1):
        membership.position = index
        membership.offset_minutes = 0 if index == 1 else calculate_offset_minutes(
            membership.post.scheduled_at,
            series.starts_at,
        )


async def remove_membership_from_series(db: AsyncSession, membership: SeriesPost):
    series = membership.series
    await db.delete(membership)
    await db.flush()
    if membership.post is not None:
        set_committed_value(membership.post, "series_membership", None)
    compact_series_positions(series, membership)
