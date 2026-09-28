# Task API — API Documentation

- **Base URL:** `http://localhost:3000`
- **Authentication:** none
- **Content type:** `application/json`
- **Schema:** `https://json-schema.org/draft/2020-12/schema`

## Response envelope

Every response, success or failure, on every endpoint uses one of these shapes.

**Single resource (200, 201)**

```json
{ "success": true, "data": { "id": "1", "title": "...", "isCompleted": false } }
```

**Collection (200)**

```json
{ "success": true, "data": [], "count": 0, "total": 0 }
```

`count` is the number of items in `data` on this page. `total` is the number of
items matching the filter *before* pagination.

**Delete (200)**

```json
{ "success": true, "message": "Task deleted successfully" }
```

**Error (400, 404, 500)**

```json
{ "success": false, "error": "Task with id '1' not found" }
```

**Validation error (400)** — `details` appears only on 400 and lists *every* problem
found in the request, not just the first.

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [{ "field": "title", "message": "title is required" }]
}
```

## Task object

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Auto-increment integer, serialized as a string |
| `title` | string | yes | Trimmed, non-empty after trim, max 200 characters |
| `description` | string | no | Trimmed, max 1000 characters. Omitted when null |
| `isCompleted` | boolean | no | Defaults to `false` on create |

```json
{
  "id": "1",
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "isCompleted": false
}
```

## Status codes

| Code | Meaning |
|------|---------|
| 200 | Successful read, update, or delete |
| 201 | Task created |
| 400 | Validation failure or malformed request |
| 404 | Task not found, or an unmatched route |
| 500 | Storage or server fault |

## Validation rules

| Field | Rule | Message |
|-------|------|---------|
| `title` | present on create | `title is required` |
| `title` | is a string | `title must be a string` |
| `title` | non-empty after trimming | `title cannot be empty` |
| `title` | at most 200 characters after trimming | `title must be at most 200 characters` |
| `description` | a string when present, or `null` | `description must be a string` |
| `description` | at most 1000 characters after trimming | `description must be at most 1000 characters` |
| `isCompleted` | a real boolean | `isCompleted must be a boolean` |
| `id` | a positive integer | `id must be a positive integer` |
| any | must be a known field | `unknown field '<name>'` |
| body | at least one field on update | `at least one field must be provided` |

Types are never coerced. `isCompleted: "true"` is a 400, not a truthy value.
String lengths are checked *after* trimming, so padding cannot be used to pass a
maximum-length rule.

---

## GET /tasks

Retrieve tasks, optionally filtered and paginated.

### Query parameters

| Name | Type | Default | Notes |
|------|------|---------|-------|
| `completed` | boolean | none | `true`, `false`, `1`, or `0`, case-insensitive. Omit for no filter |
| `limit` | integer | `50` | 1 to 100. Out of range is a 400, never clamped |
| `offset` | integer | `0` | Non-negative. Past the end yields an empty page |

### Responses

`200` — a page of tasks

```json
{
  "success": true,
  "data": [
    { "id": "1", "title": "Buy groceries", "isCompleted": false, "description": "Milk, eggs, bread" }
  ],
  "count": 1,
  "total": 1
}
```

`400` — an invalid query parameter

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [{ "field": "limit", "message": "limit must be an integer between 1 and 100" }]
}
```

`500` — storage failure

```json
{ "success": false, "error": "Internal server error" }
```

### cURL

```bash
curl "http://localhost:3000/tasks"
curl "http://localhost:3000/tasks?completed=true"
curl "http://localhost:3000/tasks?limit=10&offset=20"
```

Failure case:

```bash
curl -i "http://localhost:3000/tasks?limit=999"    # 400
```

---

## GET /tasks/{id}

Retrieve a single task.

### Path parameters

| Name | Type | Notes |
|------|------|-------|
| `id` | integer | Must be a positive integer |

### Responses

`200` — the task

```json
{ "success": true, "data": { "id": "1", "title": "Buy groceries", "isCompleted": false } }
```

`400` — the id is not a positive integer

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [{ "field": "id", "message": "id must be a positive integer" }]
}
```

`404` — no such task

```json
{ "success": false, "error": "Task with id '1' not found" }
```

### cURL

```bash
curl http://localhost:3000/tasks/1
curl -i http://localhost:3000/tasks/999999   # 404
curl -i http://localhost:3000/tasks/abc     # 400
```

---

## POST /tasks

Create a task.

### Request body

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | **yes** | Trimmed, non-empty, max 200 characters |
| `description` | string | no | Trimmed, max 1000 characters. `null` is treated as absent |
| `isCompleted` | boolean | no | Defaults to `false` |

```json
{ "title": "Buy groceries", "description": "Milk, eggs, bread" }
```

### Responses

`201` — created

```json
{
  "success": true,
  "data": { "id": "1", "title": "Buy groceries", "isCompleted": false, "description": "Milk, eggs, bread" }
}
```

`400` — validation failure, with every problem listed

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    { "field": "title", "message": "title cannot be empty" },
    { "field": "description", "message": "description must be at most 1000 characters" }
  ]
}
```

`500` — storage failure

### cURL

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy groceries","description":"Milk, eggs, bread"}'
```

Failure cases:

```bash
# 400, title cannot be empty
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" -d '{"title":"   "}'

# 400, isCompleted must be a boolean
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" -d '{"title":"x","isCompleted":"true"}'

# 400, unknown field
curl -i -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" -d '{"title":"x","color":"red"}'
```

---

## PUT /tasks/{id}

Partially update a task. Omitted fields keep their current values.

### Request body

Any non-empty subset of `title`, `description`, `isCompleted`. Sending
`"description": null` clears the field.

```json
{ "title": "Buy groceries and cook", "description": "Updated description", "isCompleted": true }
```

### Responses

`200` — the full updated record

```json
{
  "success": true,
  "data": { "id": "1", "title": "Buy groceries and cook", "isCompleted": true, "description": "Updated description" }
}
```

`400` — empty body or an invalid field. Validation runs before the existence check,
so an invalid field plus an unknown id is a 400.

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [{ "field": "body", "message": "at least one field must be provided" }]
}
```

`404` — no such task

```json
{ "success": false, "error": "Task with id '1' not found" }
```

### cURL

```bash
# partial update: only isCompleted changes
curl -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" -d '{"isCompleted":true}'

# clear the description
curl -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" -d '{"description":null}'
```

Failure cases:

```bash
# 400, at least one field must be provided
curl -i -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" -d '{}'

# 404
curl -i -X PUT http://localhost:3000/tasks/999999 \
  -H "Content-Type: application/json" -d '{"isCompleted":true}'
```

---

## DELETE /tasks/{id}

Delete a task. The operation is not idempotent in its response: the first call
returns 200, and every later call returns 404.

### Responses

`200` — deleted

```json
{ "success": true, "message": "Task deleted successfully" }
```

`400` — the id is not a positive integer

`404` — no such task

```json
{ "success": false, "error": "Task with id '1' not found" }
```

### cURL

```bash
curl -X DELETE http://localhost:3000/tasks/1
curl -i -X DELETE http://localhost:3000/tasks/1   # 404, already gone
```

---

## GET /health

Liveness probe. Not part of the task resource, but used by the test suite and
useful for process supervisors.

```bash
curl http://localhost:3000/health
```

```json
{ "success": true, "data": { "status": "ok" } }
```

## Error handling guarantee

`500` responses never disclose internals. Stack traces, absolute file paths, and
operating-system error codes are logged server-side and withheld from the client.
The only thing a client sees is:

```json
{ "success": false, "error": "Internal server error" }
```

Malformed JSON is a client error and returns `400`:

```json
{ "success": false, "error": "Malformed JSON request body" }
```
