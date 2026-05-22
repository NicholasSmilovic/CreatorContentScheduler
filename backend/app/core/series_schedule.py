from datetime import datetime, timedelta, timezone


def normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def calculate_offset_minutes(scheduled_at: datetime, starts_at: datetime) -> int:
    seconds = (normalize_datetime(scheduled_at) - normalize_datetime(starts_at)).total_seconds()
    return round(seconds / 60)


def scheduled_from_offset(starts_at: datetime, offset_minutes: int) -> datetime:
    return starts_at + timedelta(minutes=offset_minutes)
