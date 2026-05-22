---
name: creator-scheduler-write-backend-tests
description: Write focused backend tests for this Creator Scheduler FastAPI service. Use when backend auth, posts, schemas, filters, ownership, or scheduled-post behavior in this repo needs pytest coverage.
---

# Write Backend Tests

Add backend coverage using the test patterns already in `backend/tests`.

## Repo Patterns

- Prefer async API tests through the FastAPI app with `httpx.AsyncClient`.
- Reuse the `client` and `auth_headers` fixtures in `backend/tests/conftest.py`.
- Keep tests on the autouse in-memory SQLite reset fixture. Do not use `backend/scheduler.db` or seeded local data.
- Put auth coverage in `backend/tests/test_auth.py` and posts coverage in `backend/tests/test_posts.py` unless a new backend surface needs its own file.

## Coverage

- Exercise `/api/auth` and `/api/posts` contracts at the route boundary.
- Assert status codes and response fields that define the changed behavior. Avoid incidental timestamp or ordering assertions.
- Cover auth and per-user post isolation when a route reads or mutates owned data.
- Cover affected CRUD paths, `status` and `platform` filters, validation, and `scheduled_at` handling when those contracts change.
- Create a second user only when the regression needs an ownership or isolation check.

## Completion

Run the changed coverage from `backend/` before finishing:

```bash
./.venv/bin/pytest tests/test_posts.py
```

Use the focused auth file or a `-k` filter when that is narrower. Run the full backend suite when the change touches shared fixtures, auth dependencies, or multiple route modules.
