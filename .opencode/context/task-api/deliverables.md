# Task API — Deliverables — `@deliverables`

Five deliverables. `@rules.deliverables_complete` applies: each is either on disk or
explicitly reported as skipped with a reason. Silent omission is a failure.

---

## 1. Storage backend — pick exactly one — `@deliverables.storage`

| Option | Verdict |
|--------|---------|
| JSON file | **default** — persists across restarts, zero native deps, runs anywhere |
| In-memory array | acceptable only if the README states data is lost on restart |
| SQLite | acceptable if a native build is available in the target environment |
| PostgreSQL / MySQL | only if a server is already provisioned; otherwise it is a hard blocker |

The storage module must: load existing data on boot, persist on every mutation, and
surface failures as thrown errors that `errorHandler` renders as `500`. It must be
the only module that touches the filesystem or a database.

---

## 2. Source code — `@deliverables.source`

Complete and runnable. Layout in `@contract.layout`. Required properties:

- Separation of concerns: routes → controllers → store, no layer reaching past its
  neighbour.
- DRY: one envelope builder, one validation module, one error handler. No
  hand-rolled `res.json({ success: ... })` scattered across controllers.
- Descriptive names. No single-letter identifiers outside short loops.
- Comments only where the logic is non-obvious. Comments restating the code are noise.
- No stack traces or internal error text in any response (`@rules.no_stack_traces`).
- Configuration via environment variables: `PORT` (default `3000`), `HOST`
  (default `0.0.0.0`), `DATA_FILE` (default `./data/tasks.json`).

---

## 3. Tests — `@deliverables.tests`

`tests/api.test.js`, driving the app in-process without binding a port. Cover the
checklist in `verification.md` at minimum. Tests are Tier 2, not optional polish.

---

## 4. README.md — `@deliverables.readme`

- What the service is, one paragraph.
- Prerequisites and exact install/run commands.
- Environment variables with defaults.
- How to run the tests.
- A short table of the five endpoints.
- A "Decisions and assumptions" section recording: chosen stack, chosen storage,
  `id` format, and the `null`-description semantics.

---

## 5. API documentation — `@deliverables.docs`

`API_DOCUMENTATION.md` (or `OPENAPI_SPEC.yaml` instead — pick one, not both):

- Base URL and the fact that there is no authentication.
- Per endpoint: description, method, path, path/query params, request body schema,
  success response, each error response, and the status codes it can return.
- Runnable cURL for all five endpoints, including one failure case per endpoint.
- Any behaviour not obvious from the schema, taken from `<conflict_resolution>`.

---

## 6. Postman collection — `@deliverables.postman`

`postman/Task_API_Collection.json`, importable without editing:

- All five endpoints, correctly named and ordered so the happy path runs top to bottom.
- `baseUrl` (`http://localhost:3000`) and `taskId` environment variables.
- `POST` and `PUT` bodies in raw/JSON form with example values.
- A test script on `POST` that captures the new id into `taskId`, so `GET /tasks/{id}`,
  `PUT`, and `DELETE` are runnable straight after a create.
- Response-shape assertions on every request: `success` is a boolean, `data` is
  present when `success` is true, `error` is present when it is false.

---

## 7. Submission format — `@deliverables.submission`

One directory, exactly this shape:

```
task-api-solution/
├── src/
├── tests/
├── postman/Task_API_Collection.json
├── README.md
├── API_DOCUMENTATION.md
└── .gitignore
```

`.gitignore` must exclude `node_modules/`, the data file, and any coverage output.
