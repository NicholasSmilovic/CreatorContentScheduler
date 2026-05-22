---
name: creator-scheduler-run-frontend-tests
description: Run and triage frontend tests for this Creator Scheduler Vite React app. Use when Codex should execute the repo Vitest suite, run a focused frontend test, or summarize React test failures.
---

# Run Frontend Tests

Run Vitest from `frontend/` and summarize failures at the file and assertion level.

## Commands

Run the full frontend suite:

```bash
cd frontend
npm run test
```

Use one-shot focused runs during triage:

```bash
npx vitest run src/api/client.test.js
npx vitest run src/context/AuthContext.test.jsx -t "login"
```

Use `npm run test:watch` only when the user asks for a watch loop. If `frontend/node_modules` is missing, follow the frontend setup in `readme.md` before calling it a test failure.

## Triage

1. Read the failing test name, assertion diff, and mock or environment error before rerunning.
2. Check whether the failure belongs to API-client behavior, auth context state, routing wrappers, or a changed page/component.
3. Keep jsdom and shared setup assumptions aligned with `frontend/vite.config.js` and `frontend/src/test/setup.js`.
4. Report the command, test-file summary, failing test names, and the first actionable failure detail.
