import pytest
from httpx import AsyncClient


async def create_series(
    client: AsyncClient,
    auth_headers: dict,
    name: str = "Launch",
    platform: str = "instagram",
    starts_at: str = "2026-06-10T10:00:00Z",
):
    return await client.post(
        "/api/series",
        headers=auth_headers,
        json={"name": name, "platform": platform, "starts_at": starts_at},
    )


async def create_scheduled_post(
    client: AsyncClient,
    auth_headers: dict,
    title: str = "Announcement",
    scheduled_at: str = "2026-06-10T10:00:00Z",
):
    return await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": title,
            "platform": "instagram",
            "status": "scheduled",
            "scheduled_at": scheduled_at,
        },
    )


@pytest.mark.asyncio
async def test_create_list_and_get_series(client: AsyncClient, auth_headers: dict):
    created = await create_series(client, auth_headers)
    assert created.status_code == 201
    assert created.json()["name"] == "Launch"
    assert created.json()["platform"] == "instagram"

    listed = await client.get("/api/series", headers=auth_headers)
    assert listed.status_code == 200
    assert [series["name"] for series in listed.json()] == ["Launch"]
    assert listed.json()[0]["platform"] == "instagram"

    detail = await client.get(f"/api/series/{created.json()['id']}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["platform"] == "instagram"
    assert detail.json()["posts"] == []


@pytest.mark.asyncio
async def test_create_series_requires_platform(client: AsyncClient, auth_headers: dict):
    created = await client.post(
        "/api/series",
        headers=auth_headers,
        json={"name": "Launch", "starts_at": "2026-06-10T10:00:00Z"},
    )
    assert created.status_code == 422


@pytest.mark.asyncio
async def test_series_is_scoped_to_owner(client: AsyncClient, auth_headers: dict):
    created = await create_series(client, auth_headers)
    await client.post(
        "/api/auth/register",
        json={
            "email": "other@example.com",
            "password": "testpass123",
            "full_name": "Other User",
        },
    )
    login = await client.post(
        "/api/auth/login",
        json={"email": "other@example.com", "password": "testpass123"},
    )
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    detail = await client.get(f"/api/series/{created.json()['id']}", headers=other_headers)
    assert detail.status_code == 404


@pytest.mark.asyncio
async def test_attach_post_computes_offset_and_role(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    created = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Teaser",
            "platform": "instagram",
            "status": "scheduled",
            "scheduled_at": "2026-06-03T10:00:00Z",
            "series_id": series["id"],
            "series_role_label": "Teaser",
        },
    )

    assert created.status_code == 201
    membership = created.json()["series"]
    assert membership == {
        "id": series["id"],
        "name": "Launch",
        "platform": "instagram",
        "role_label": "Teaser",
        "offset_minutes": -10080,
    }

    detail = await client.get(f"/api/series/{series['id']}", headers=auth_headers)
    assert detail.json()["posts"][0]["title"] == "Teaser"


@pytest.mark.asyncio
async def test_attach_requires_schedule(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    created = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Unscheduled",
            "platform": "instagram",
            "status": "draft",
            "series_id": series["id"],
        },
    )
    assert created.status_code == 400
    assert created.json()["detail"] == "Series posts must have a scheduled time"


@pytest.mark.asyncio
async def test_series_created_post_uses_series_platform(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers, platform="linkedin")).json()
    created = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Announcement",
            "platform": "instagram",
            "status": "scheduled",
            "scheduled_at": "2026-06-10T10:00:00Z",
            "series_id": series["id"],
        },
    )
    assert created.status_code == 201
    assert created.json()["platform"] == "linkedin"
    assert created.json()["series"]["platform"] == "linkedin"


@pytest.mark.asyncio
async def test_reject_attach_existing_post_with_mismatched_platform(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers, platform="linkedin")).json()
    post = (await create_scheduled_post(client, auth_headers)).json()
    attached = await client.patch(
        f"/api/posts/{post['id']}",
        headers=auth_headers,
        json={"series_id": series["id"]},
    )
    assert attached.status_code == 400
    assert attached.json()["detail"] == "Series posts must use the series platform"


@pytest.mark.asyncio
async def test_reject_platform_change_for_series_post(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    post = (await create_scheduled_post(client, auth_headers)).json()
    await client.patch(
        f"/api/posts/{post['id']}",
        headers=auth_headers,
        json={"series_id": series["id"]},
    )
    changed = await client.patch(
        f"/api/posts/{post['id']}",
        headers=auth_headers,
        json={"platform": "linkedin"},
    )
    assert changed.status_code == 400
    assert changed.json()["detail"] == "Series posts must use the series platform"


@pytest.mark.asyncio
async def test_non_series_post_platform_update_still_works(client: AsyncClient, auth_headers: dict):
    post = (await create_scheduled_post(client, auth_headers)).json()
    changed = await client.patch(
        f"/api/posts/{post['id']}",
        headers=auth_headers,
        json={"platform": "linkedin"},
    )
    assert changed.status_code == 200
    assert changed.json()["platform"] == "linkedin"


@pytest.mark.asyncio
async def test_reschedule_member_recomputes_offset(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    post = (await create_scheduled_post(client, auth_headers)).json()
    attached = await client.patch(
        f"/api/posts/{post['id']}",
        headers=auth_headers,
        json={"series_id": series["id"], "series_role_label": "Announcement"},
    )
    assert attached.json()["series"]["offset_minutes"] == 0

    rescheduled = await client.patch(
        f"/api/posts/{post['id']}",
        headers=auth_headers,
        json={"scheduled_at": "2026-06-11T12:00:00Z"},
    )
    assert rescheduled.status_code == 200
    assert rescheduled.json()["series"]["offset_minutes"] == 1560


@pytest.mark.asyncio
async def test_series_start_shift_preserves_offsets(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    created = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Reminder",
            "platform": "linkedin",
            "status": "scheduled",
            "scheduled_at": "2026-06-11T10:00:00Z",
            "series_id": series["id"],
        },
    )
    assert created.json()["series"]["offset_minutes"] == 1440

    shifted = await client.patch(
        f"/api/series/{series['id']}",
        headers=auth_headers,
        json={"starts_at": "2026-06-20T08:30:00Z"},
    )
    assert shifted.status_code == 200
    shifted_post = shifted.json()["posts"][0]
    assert shifted_post["scheduled_at"].startswith("2026-06-21T08:30:00")
    assert shifted_post["series"]["offset_minutes"] == 1440


@pytest.mark.asyncio
async def test_detach_allows_unscheduling(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    created = (await create_scheduled_post(client, auth_headers)).json()
    await client.patch(
        f"/api/posts/{created['id']}",
        headers=auth_headers,
        json={"series_id": series["id"]},
    )

    rejected = await client.patch(
        f"/api/posts/{created['id']}",
        headers=auth_headers,
        json={"scheduled_at": None},
    )
    assert rejected.status_code == 400

    detached = await client.patch(
        f"/api/posts/{created['id']}",
        headers=auth_headers,
        json={"series_id": None, "scheduled_at": None},
    )
    assert detached.status_code == 200
    assert detached.json()["scheduled_at"] is None
    assert detached.json()["series"] is None


@pytest.mark.asyncio
async def test_moving_post_keeps_single_membership(client: AsyncClient, auth_headers: dict):
    first = (await create_series(client, auth_headers, "First")).json()
    second = (await create_series(client, auth_headers, "Second")).json()
    created = (await create_scheduled_post(client, auth_headers)).json()

    await client.patch(
        f"/api/posts/{created['id']}",
        headers=auth_headers,
        json={"series_id": first["id"]},
    )
    moved = await client.patch(
        f"/api/posts/{created['id']}",
        headers=auth_headers,
        json={"series_id": second["id"]},
    )
    assert moved.status_code == 200
    assert moved.json()["series"]["id"] == second["id"]

    first_detail = await client.get(f"/api/series/{first['id']}", headers=auth_headers)
    second_detail = await client.get(f"/api/series/{second['id']}", headers=auth_headers)
    assert first_detail.json()["posts"] == []
    assert [post["id"] for post in second_detail.json()["posts"]] == [created["id"]]
