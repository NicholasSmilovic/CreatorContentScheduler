---
name: creator-scheduler-run-backend-tests
description: Run and triage backend tests for this Creator Scheduler FastAPI service. Use when Codex should execute the repo pytest suite, run a focused backend test, or summarize backend test failures and warnings.
---

# Run Backend Tests

Run backend pytest coverage from `backend/`.

## Commands

Prefer the checked-out virtualenv when it exists:

```bash
cd backend
./.venv/bin/pytest
```

Use focused runs during triage:

```bash
./.venv/bin/pytest tests/test_posts.py
./.venv/bin/pytest tests/test_auth.py -k login
```

If `backend/.venv` is missing, follow the backend setup in `readme.md` and `backend/requirements.txt` before calling it a test failure.

## Triage

1. Read the first failing assertion, traceback, or fixture setup error before rerunning.
2. Separate route-contract failures from setup failures such as a missing virtualenv or dependency.
3. Keep local app data out of the diagnosis: backend tests use the in-memory database fixture in `backend/tests/conftest.py`.
4. Report the command, pass/fail summary, failing test names, actionable error line, and warnings.

## Known Warnings

Do not hide warnings. Call them out separately if they appear while tests pass:

- `pytest-asyncio` warns when `asyncio_default_fixture_loop_scope` is unset.
- Pydantic warns about class-based `Config` with v2.
- Passlib may warn that Python `crypt` is deprecated.
