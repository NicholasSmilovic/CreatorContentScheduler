---
name: creator-scheduler-write-frontend-tests
description: Write focused frontend tests for this Creator Scheduler Vite React app. Use when API client calls, auth context, protected routes, posts pages, calendar UI, or other React behavior in this repo needs Vitest coverage.
---

# Write Frontend Tests

Add frontend coverage using the Vitest and React Testing Library patterns already in `frontend/src`.

## Repo Patterns

- Read `frontend/vite.config.js`, `frontend/src/test/setup.js`, and the nearest existing test before adding coverage.
- Keep API tests with `frontend/src/api/client.test.js`.
- Follow the existing `AuthContext` and `ProtectedRoute` tests for context, routing, local storage, and mock setup.
- Mock `authApi` or `postsApi` at the boundary for page and context tests that should not hit the network.

## Coverage

- Test visible behavior with React Testing Library rather than component internals.
- Add router or auth wrappers only when the component needs them.
- Cover the page state the change owns: loading, empty, success, or error.
- Reset fetch mocks and local storage when auth or API behavior changes.
- For posts or calendar work, check the visible filter, post, schedule, and event behavior without asserting react-big-calendar internals.

## Completion

Run the changed coverage from `frontend/` before finishing:

```bash
npx vitest run src/api/client.test.js
```

Use the relevant test file while iterating. Run `npm run test` when the change crosses shared API, auth, routing, or page behavior.
