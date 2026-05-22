---
name: creator-scheduler-iterate-local-ui
description: Run this Creator Scheduler backend and frontend locally and inspect UI flows. Use when Codex should start or reuse the FastAPI and Vite dev servers, seed demo posts, verify auth, posts, or calendar changes in the browser, or capture local UI screenshots.
---

# Iterate Local UI

Run the app locally and verify the changed browser flow.

## Start The App

1. From the repo root, check whether ports `8000` and `5173` already serve this checkout before starting duplicate servers.
2. Start the backend from `backend/` with the local virtualenv when available:

```bash
./.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

3. Start the frontend from `frontend/`:

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

4. Keep needed dev-server sessions alive until verification finishes. If dependencies or the virtualenv are missing, follow `readme.md` and say what was needed.

## Prepare Data

- Use registration for a clean auth flow.
- Seed the local SQLite database when populated posts or calendar events make the verification meaningful:

```bash
backend/.venv/bin/python backend/scripts/seed_data.py
```

- After seeding, log in with a README demo account such as `alice@example.com` and `password123`.
- Treat seeding as local app-state mutation; avoid it when the requested verification should stay on an empty database.

## Inspect And Iterate

- Use the Browser skill for localhost navigation, interactions, screenshots, and console checks.
- Verify the affected flow first. Smoke adjacent login, posts list/create/edit, and calendar paths when the change can affect them.
- Take screenshots for changed layout, state transitions, or user-facing results.
- If browser access is unavailable, say so instead of claiming visual verification.
- Prefer the frontend at `http://localhost:5173` and the API docs at `http://localhost:8000/docs` when direct backend inspection helps.

## Completion

Report which servers were started or reused, which UI flows were exercised, and the screenshot evidence gathered. Include screenshots in the final response when the user asked for them or the task was a UI verification pass.
