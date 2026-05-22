import pytest
from httpx import AsyncClient


async def create_series(
    client: AsyncClient,
    auth_headers: dict,
    name: str = "Launch",
    platform: str = "instagram",
):
    return await client.post(
        "/api/series",
        headers=auth_headers,
        json={"name": name, "platform": platform},
    )


async def create_scheduled_post(
    client: AsyncClient,
    auth_headers: dict,
    title: str = "Announcement",
    platform: str = "instagram",
    scheduled_at: str = "2026-06-10T10:00:00Z",
):
    return await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": title,
            "platform": platform,
            "status": "scheduled",
            "scheduled_at": scheduled_at,
        },
    )


async def create_series_post(
    client: AsyncClient,
    auth_headers: dict,
    series_id: int,
    title: str,
    scheduled_at: str,
):
    return await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": title,
            "platform": "instagram",
            "status": "scheduled",
            "scheduled_at": scheduled_at,
            "series_id": series_id,
        },
    )


@pytest.mark.asyncio
async def test_create_list_and_get_empty_series(client: AsyncClient, auth_headers: dict):
    created = await create_series(client, auth_headers)
    assert created.status_code == 201
    assert created.json()["name"] == "Launch"
    assert created.json()["platform"] == "instagram"
    assert created.json()["starts_at"] is None

    listed = await client.get("/api/series", headers=auth_headers)
    assert listed.status_code == 200
    assert [series["name"] for series in listed.json()] == ["Launch"]
    assert listed.json()[0]["starts_at"] is None

    detail = await client.get(f"/api/series/{created.json()['id']}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["posts"] == []


@pytest.mark.asyncio
async def test_create_series_requires_platform(client: AsyncClient, auth_headers: dict):
    created = await client.post(
        "/api/series",
        headers=auth_headers,
        json={"name": "Launch"},
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
async def test_first_post_sets_series_anchor(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    created = await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Teaser",
        "2026-06-03T10:00:00Z",
    )

    assert created.status_code == 201
    assert created.json()["series"]["position"] == 1
    assert created.json()["series"]["offset_minutes"] == 0

    detail = await client.get(f"/api/series/{series['id']}", headers=auth_headers)
    assert detail.json()["starts_at"].startswith("2026-06-03T10:00:00")
    assert detail.json()["posts"][0]["series"]["position"] == 1


@pytest.mark.asyncio
async def test_second_post_appends_as_position_two(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    await create_series_post(client, auth_headers, series["id"], "Teaser", "2026-06-03T10:00:00Z")
    follow_up = await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Follow-up",
        "2026-06-04T10:00:00Z",
    )

    assert follow_up.status_code == 201
    assert follow_up.json()["series"]["position"] == 2
    assert follow_up.json()["series"]["offset_minutes"] == 1440


@pytest.mark.asyncio
async def test_reject_append_before_current_last_post(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    await create_series_post(client, auth_headers, series["id"], "Teaser", "2026-06-03T10:00:00Z")
    rejected = await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Too early",
        "2026-06-02T10:00:00Z",
    )

    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "Series posts must be scheduled after the current last post"


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
    assert created.json()["series"]["position"] == 1


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
async def test_reschedule_second_member_recomputes_offset(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    await create_series_post(client, auth_headers, series["id"], "Teaser", "2026-06-10T10:00:00Z")
    follow_up = (await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Follow-up",
        "2026-06-11T10:00:00Z",
    )).json()

    rescheduled = await client.patch(
        f"/api/posts/{follow_up['id']}",
        headers=auth_headers,
        json={"scheduled_at": "2026-06-11T12:00:00Z"},
    )
    assert rescheduled.status_code == 200
    assert rescheduled.json()["series"]["position"] == 2
    assert rescheduled.json()["series"]["offset_minutes"] == 1560


@pytest.mark.asyncio
async def test_reject_reschedule_member_before_previous(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    await create_series_post(client, auth_headers, series["id"], "Teaser", "2026-06-10T10:00:00Z")
    follow_up = (await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Follow-up",
        "2026-06-11T10:00:00Z",
    )).json()

    rescheduled = await client.patch(
        f"/api/posts/{follow_up['id']}",
        headers=auth_headers,
        json={"scheduled_at": "2026-06-09T12:00:00Z"},
    )
    assert rescheduled.status_code == 400
    assert rescheduled.json()["detail"] == "Series posts must stay after the previous post"


@pytest.mark.asyncio
async def test_series_start_shift_preserves_offsets(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    await create_series_post(client, auth_headers, series["id"], "Teaser", "2026-06-10T10:00:00Z")
    await create_series_post(client, auth_headers, series["id"], "Follow-up", "2026-06-11T10:00:00Z")

    shifted = await client.patch(
        f"/api/series/{series['id']}",
        headers=auth_headers,
        json={"starts_at": "2026-06-20T08:30:00Z"},
    )
    assert shifted.status_code == 200
    assert shifted.json()["starts_at"].startswith("2026-06-20T08:30:00")
    assert [post["scheduled_at"][:16] for post in shifted.json()["posts"]] == [
        "2026-06-20T08:30",
        "2026-06-21T08:30",
    ]
    assert [post["series"]["offset_minutes"] for post in shifted.json()["posts"]] == [0, 1440]


@pytest.mark.asyncio
async def test_moving_first_post_shifts_series(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    first = (await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Teaser",
        "2026-06-10T10:00:00Z",
    )).json()
    await create_series_post(client, auth_headers, series["id"], "Follow-up", "2026-06-11T10:00:00Z")

    moved = await client.patch(
        f"/api/posts/{first['id']}",
        headers=auth_headers,
        json={"scheduled_at": "2026-06-12T09:00:00Z"},
    )
    assert moved.status_code == 200

    detail = await client.get(f"/api/series/{series['id']}", headers=auth_headers)
    assert [post["scheduled_at"][:16] for post in detail.json()["posts"]] == [
        "2026-06-12T09:00",
        "2026-06-13T09:00",
    ]


@pytest.mark.asyncio
async def test_detach_anchor_promotes_next_post(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    first = (await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Teaser",
        "2026-06-10T10:00:00Z",
    )).json()
    second = (await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Follow-up",
        "2026-06-11T10:00:00Z",
    )).json()

    detached = await client.patch(
        f"/api/posts/{first['id']}",
        headers=auth_headers,
        json={"series_id": None},
    )
    assert detached.status_code == 200

    detail = await client.get(f"/api/series/{series['id']}", headers=auth_headers)
    assert detail.json()["starts_at"].startswith("2026-06-11T10:00:00")
    assert detail.json()["posts"][0]["id"] == second["id"]
    assert detail.json()["posts"][0]["series"]["position"] == 1
    assert detail.json()["posts"][0]["series"]["offset_minutes"] == 0


@pytest.mark.asyncio
async def test_delete_anchor_promotes_next_post(client: AsyncClient, auth_headers: dict):
    series = (await create_series(client, auth_headers)).json()
    first = (await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Teaser",
        "2026-06-10T10:00:00Z",
    )).json()
    second = (await create_series_post(
        client,
        auth_headers,
        series["id"],
        "Follow-up",
        "2026-06-11T10:00:00Z",
    )).json()

    deleted = await client.delete(f"/api/posts/{first['id']}", headers=auth_headers)
    assert deleted.status_code == 204

    detail = await client.get(f"/api/series/{series['id']}", headers=auth_headers)
    assert [post["id"] for post in detail.json()["posts"]] == [second["id"]]
    assert detail.json()["posts"][0]["series"]["position"] == 1
    assert detail.json()["posts"][0]["series"]["offset_minutes"] == 0


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
    assert moved.json()["series"]["position"] == 1

    first_detail = await client.get(f"/api/series/{first['id']}", headers=auth_headers)
    second_detail = await client.get(f"/api/series/{second['id']}", headers=auth_headers)
    assert first_detail.json()["posts"] == []
    assert first_detail.json()["starts_at"] is None
    assert [post["id"] for post in second_detail.json()["posts"]] == [created["id"]]


@pytest.mark.asyncio
async def test_reject_same_platform_posts_inside_15_minutes(client: AsyncClient, auth_headers: dict):
    first = await create_scheduled_post(
        client,
        auth_headers,
        title="First",
        scheduled_at="2026-06-10T10:00:00Z",
    )
    assert first.status_code == 201

    rejected = await create_scheduled_post(
        client,
        auth_headers,
        title="Too close",
        scheduled_at="2026-06-10T10:10:00Z",
    )
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "Posts on the same platform must be at least 15 minutes apart"
