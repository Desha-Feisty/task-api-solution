# Task API — Verification — `@verification`

`@rules.verify_before_claim` governs this file: nothing here counts as done until the
check has actually been run and its output observed. Run the server, exercise each
case with real requests, and keep the evidence.

---

## Gate 1 — List — `@verification.list`

- `GET /tasks` → `200`; `success` true; `data` is an array; `count === data.length`;
  `total` present.
- `GET /tasks` on an empty store → `200` with `data: []`, `count: 0`, `total: 0`.
- `GET /tasks?completed=true` after creating one completed and one open task →
  `200`, only completed tasks returned, `total` counts only completed tasks.
- `GET /tasks?completed=false` → inverse filter.
- `GET /tasks?limit=2` with 5 stored tasks → `count` 2, `total` 5.
- `GET /tasks?limit=2&offset=4` → the last page; `count` 1, `total` 5.
- `GET /tasks?offset=99` → `200` with an empty `data` array, **not** an error.
- `GET /tasks?limit=0`, `?limit=-1`, `?limit=101`, `?limit=abc` → `400`.
- `GET /tasks?offset=-1` → `400`.
- `GET /tasks?completed=maybe` → `400`.
- `GET /tasks?completed=TRUE` and `?completed=1` → `200`, filter applied.

## Gate 2 — Read one — `@verification.read`

- `GET /tasks/{id}` for a known id → `200`, `data.id` matches, all four fields present.
- `GET /tasks/999999` → `404` with the exact message `Task with id '999999' not found`.
- `GET /tasks/abc` → `400`.
- `GET /tasks/0` and `GET /tasks/-1` → `400`.

## Gate 3 — Create — `@verification.create`

- `POST /tasks` with `{ "title": "Buy groceries" }` → `201`, generated `id`, `isCompleted`
  `false`, no `description` key.
- `POST /tasks` with all three fields → `201`, values echoed correctly.
- `POST /tasks` with `description: null` → `201`, treated as absent.
- `POST /tasks` with no body / empty body / non-JSON body → `400`.
- `POST /tasks` with `{}` → `400`, `details[0].field === "title"`.
- `POST /tasks` with `title: ""` and with `title: "   "` → `400`,
  `title cannot be empty`.
- `POST /tasks` with `title: 123` → `400`, `title must be a string`.
- `POST /tasks` with a 200-char title → `201`.
- `POST /tasks` with a 201-char title → `400`, max-length message.
- `POST /tasks` with a 1001-char description → `400`.
- `POST /tasks` with `isCompleted: "true"` and with `isCompleted: 1` → `400`.
- `POST /tasks` with both an empty title and a 201-char description → `400` with
  **two** entries in `details` (all errors collected, not just the first).
- `POST /tasks` with an unknown key `color: "red"` → `400`, `unknown field 'color'`.
- Two consecutive creates → distinct ids.

## Gate 4 — Update — `@verification.update`

- `PUT /tasks/{id}` with only `{ "isCompleted": true }` → `200`; `title` and
  `description` unchanged. This is the partial-update case.
- `PUT /tasks/{id}` with all three fields → `200`, all replaced.
- `PUT /tasks/{id}` with `description: null` → `200`, field cleared.
- `PUT /tasks/{id}` with `{}` → `400`, `at least one field must be provided`.
- `PUT /tasks/{id}` with no body → `400`.
- `PUT /tasks/{id}` with `title: "  "` → `400`, `title cannot be empty`.
- `PUT /tasks/{id}` with a 201-char title → `400`.
- `PUT /tasks/{id}` with `isCompleted: "yes"` → `400`.
- `PUT /tasks/999999` with a valid field → `404`.
- `PUT /tasks/abc` → `400`.
- `PUT` with an invalid field **and** an unknown id → `400` (validation precedes
  existence).
- A `PUT` that succeeds is reflected in the next `GET /tasks/{id}`.

## Gate 5 — Delete — `@verification.delete`

- `DELETE /tasks/{id}` for a known id → `200`, `success` true, `message` is
  `Task deleted successfully`.
- `DELETE` the same id again → `404`.
- `GET` the deleted id → `404`.
- `DELETE /tasks/999999` → `404`.
- `DELETE /tasks/abc` → `400`.
- `count`/`total` in a following `GET /tasks` reflect the deletion.

## Gate 6 — Cross-cutting — `@verification.crosscutting`

- No response body anywhere contains `at Object.`, a stack trace, an absolute file
  path, or a storage-driver message.
- Every error body has `success: false` and a non-empty `error` string; no endpoint
  returns a 5xx body that leaks internals.
- A forced storage failure (make the data file unwritable) yields `500` with a safe
  message while the full error appears in the server log.
- `POST` with a JSON array body and with a JSON string body → `400`, not `500`.
- Server logs contain no unhandled exception traces after the full checklist run.
- Restart the server: tasks created before the restart are still present.
- Every status code emitted across the whole run is one of 200, 201, 400, 404, 500.
- All five endpoints are reachable with no leading-slash mistakes and no trailing-slash
  404s for `/tasks`.

## Gate 7 — Documentation and collection — `@verification.docs`

- Every cURL in `API_DOCUMENTATION.md` was pasted into a shell and executed.
- The Postman collection imports without error and runs green top to bottom.
- `README.md` install and run steps work from a clean clone.
- The documented response shapes match what the server actually returns.

---

## Success criteria and weighting

| Criterion | Weight | Gate |
|-----------|--------|------|
| Functionality — all five endpoints behave as specified | 50% | Gates 1–5 |
| Code quality — clean, readable, well-organized | 30% | Gate 6 + `@deliverables.source` |
| Validation — correct input rejection and error handling | 10% | Gates 3–4 |
| Documentation — clear docs and Postman collection | 10% | Gate 7 |

Code quality is judged on the source as written, not on runtime behaviour: a
working API written as one 400-line file with duplicated response shaping does not
earn the 30%, however well it passes Gate 1.
