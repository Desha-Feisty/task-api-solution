# Task API — Contract (Single Source of Truth)

Everything in this file is binding. Do not re-derive it, and do not deviate from it
to "improve" the design. Ambiguities are resolved in `../PROMPT.optimized.xml`
under `<conflict_resolution>`.

---

## 1. Data Model — `@contract.data_model`

A Task has exactly four fields. No additional fields are permitted in Tier 1/2;
timestamps and extras belong to Tier 3.

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `id` | string | yes | generated | Auto-increment integer, serialized as a string |
| `title` | string | yes | — | Trimmed; non-empty after trim; max 200 chars |
| `description` | string | no | `null` | Trimmed; max 1000 chars |
| `isCompleted` | boolean | no | `false` | Must be a real boolean, never `"true"`/`1` |

Serialized shape:

```json
{
  "id": "1",
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "isCompleted": false
}
```

`description` is omitted from responses when it is `null`, except on update where an
explicit `null` is accepted and clears the field.

---

## 2. Response Envelope — `@contract.envelope`

Every response on every endpoint uses exactly one of these two shapes. Never emit a
bare object, a bare array, or a mix.

**Success (single resource):**

```json
{ "success": true, "data": { "id": "1", "title": "...", "isCompleted": false } }
```

**Success (collection):**

```json
{ "success": true, "data": [], "count": 1, "total": 1 }
```

`count` is the number of items in `data` on this page. `total` is the number of
items matching the filter *before* pagination is applied.

**Success (delete):**

```json
{ "success": true, "message": "Task deleted successfully" }
```

**Error:**

```json
{ "success": false, "error": "Task with id '1' not found" }
```

**Error (validation):**

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [{ "field": "title", "message": "title is required" }]
}
```

`details` is present only on 400 responses. Collect **all** field errors in one pass;
do not stop at the first.

---

## 3. Validation Rules — `@contract.validation`

| Field | Rule | Message when violated |
|-------|------|----------------------|
| `title` (create) | present | `title is required` |
| `title` (create) | is a string | `title must be a string` |
| `title` (create) | non-empty after trim | `title cannot be empty` |
| `title` (create) | ≤ 200 chars after trim | `title must be at most 200 characters` |
| `title` (update) | only validated if the key is present | same as above |
| `description` | absent or `null` on create | — |
| `description` | is a string when present | `description must be a string` |
| `description` | ≤ 1000 chars after trim | `description must be at most 1000 characters` |
| `isCompleted` | absent on create → `false` | — |
| `isCompleted` | boolean when present | `isCompleted must be a boolean` |
| `id` | positive integer | `id must be a positive integer` |
| `id` | must resolve to a stored task | `Task with id '<id>' not found` |
| body | ≥ 1 recognized key on update | `at least one field must be provided` |

Sanitization: trim `title` and `description`; reject unknown top-level keys in
`POST`/`PUT` with `unknown field '<key>'`. Never coerce types silently — a string
`"true"` for `isCompleted` is a 400, not a truthy value.

---

## 4. Endpoints — `@contract.endpoints`

Base URL `http://localhost:3000`. No authentication.

### GET /tasks — list

Query: `completed` (bool, optional), `limit` (int, default `50`), `offset` (int, default `0`).
`limit` must be an integer in `1..100`; out-of-range or non-integer → 400.
`offset` must be an integer ≥ 0.

- `200` — `{ success, data: Task[], count, total }`
- `400` — invalid `completed`, `limit`, or `offset`
- `500` — storage failure, e.g. `{ "success": false, "error": "Database connection failed" }`

### GET /tasks/{id} — read one

- `200` — `{ success, data: Task }`
- `400` — id is not a positive integer
- `404` — `{ "success": false, "error": "Task with id '1' not found" }`
- `500` — storage failure

### POST /tasks — create

Body: `{ "title": string, "description"?: string, "isCompleted"?: boolean }`

- `201` — `{ success, data: Task }` with a generated `id`
- `400` — validation failure with `details[]`
- `500` — storage failure

### PUT /tasks/{id} — partial update

Body: any non-empty subset of the three fields. Omitted keys are left untouched.

- `200` — `{ success, data: Task }` reflecting the full updated record
- `400` — empty body, or any field fails `@contract.validation`
- `404` — unknown id
- `500` — storage failure

Validation runs before the existence check only for shape; a request with both an
invalid field and an unknown id returns `400` (validation is cheaper and the contract
says validate first).

### DELETE /tasks/{id} — remove

- `200` — `{ success: true, "message": "Task deleted successfully" }`
- `400` — id is not a positive integer
- `404` — unknown id
- `500` — storage failure

---

## 5. Status Code Table — `@contract.status_codes`

| Code | Meaning | Applies to |
|------|---------|-----------|
| 200 | OK | successful GET, PUT, DELETE |
| 201 | Created | successful POST |
| 400 | Bad Request | validation failure, malformed body, bad query param |
| 404 | Not Found | well-formed id that resolves to nothing |
| 500 | Internal Server Error | storage or unhandled server fault |

---

## 6. Layout — `@contract.layout`

```
task-api-solution/
├── src/
│   ├── app.js              # app factory + route mounting (no listen)
│   ├── server.js           # entry point, reads env config
│   ├── routes/taskRoutes.js
│   ├── controllers/taskController.js
│   ├── models/Task.js
│   ├── middleware/errorHandler.js
│   ├── middleware/notFound.js
│   ├── validation/taskValidation.js
│   └── storage/taskStore.js
├── tests/api.test.js
├── postman/Task_API_Collection.json
├── package.json
├── README.md
├── API_DOCUMENTATION.md
└── .gitignore
```

Responsibilities, in order of the request lifecycle: `taskRoutes` maps method and
path to a controller and nothing else; `taskController` reads params, calls
validation, calls the store, and shapes the envelope; `taskStore` is the only module
that touches persistence; `errorHandler` converts thrown errors into
`@contract.envelope` error bodies. `app.js` exports the app without calling
`listen`, so tests can drive it in-process.
