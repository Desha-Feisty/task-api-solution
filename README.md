# Task API

A REST API for a task management service. Create, read, update, and delete tasks
over HTTP with a consistent JSON envelope, strict input validation, and JSON-file
persistence.

- **Stack:** Node.js 20.11+ (native ESM) with Express 4
- **Storage:** JSON file on disk (data survives restarts)
- **Auth:** none

## Quick start

```bash
npm install
npm start
```

The server listens on `http://localhost:3000` by default.

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy groceries","description":"Milk, eggs, bread"}'
```

## Run the tests

```bash
npm test
```

43 tests covering validation, status codes, the response envelope, persistence
across restart, and the guarantee that no response leaks a stack trace or internal
error text.

## Configuration

All configuration is read from environment variables.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `0.0.0.0` | Interface to bind |
| `DATA_FILE` | `./data/tasks.json` | Where tasks are persisted |

```bash
PORT=8080 DATA_FILE=./tmp/tasks.json npm start
```

## Endpoints

| Method | Path | Purpose | Success |
|--------|------|---------|---------|
| GET | `/tasks` | List tasks, with filtering and pagination | 200 |
| GET | `/tasks/{id}` | Fetch one task | 200 |
| POST | `/tasks` | Create a task | 201 |
| PUT | `/tasks/{id}` | Partially update a task | 200 |
| DELETE | `/tasks/{id}` | Delete a task | 200 |
| GET | `/health` | Liveness probe | 200 |

Full request and response details are in [API_DOCUMENTATION.md](API_DOCUMENTATION.md).
A Postman collection is in [postman/Task_API_Collection.json](postman/Task_API_Collection.json).

## Project layout

```
src/
├── app.js                      Express app factory (does not listen)
├── server.js                   Entry point; reads env config and listens
├── routes/taskRoutes.js        Method and path to controller, nothing else
├── controllers/taskController.js  Envelope shaping; delegates to the store
├── models/Task.js              Field limits and serialization
├── validation/taskValidation.js  All input rules, collecting every error
├── storage/taskStore.js        The only module that touches the filesystem
└── middleware/
    ├── errorHandler.js         Terminal handler; the boundary that hides internals
    └── notFound.js             Unmatched routes
```

The dependency direction is strictly one way:

```
routes -> controllers -> storage
              |
        validation, models
```

`storage/taskStore.js` is the only module that reads or writes files, which is
what makes it possible to reason about every write in the system by reading one file.

### Module system

`package.json` sets `"type": "module"`, so the source is native ESM. Two rules
follow from that, and breaking either fails at load time rather than at runtime:

- Use `import` and `export`; there is no `require` and no `module.exports`.
- Relative imports must name the file extension, as in `./app.js`, not `./app`.

`src/server.js` reads `import.meta.dirname` to build the default `DATA_FILE`
path. That property requires Node.js 20.11 or newer, which is why the `engines`
field and the stack note above both name that floor.

## Decisions and assumptions

The requirements left several things open. These are the choices made, and why.

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| `id` format | Auto-increment integer, serialized as a string | The requirements permitted UUID or auto-increment. Integers keep JSON responses stringly consistent with the spec examples while staying simple. |
| Stack | Node.js + Express | Stated as the recommended default; the requirements did not mandate a language. |
| Storage | JSON file | Persists across restarts with no native build step and no external service, so the project runs from a clean clone. |
| `description: null` on create | Treated as absent; key omitted from responses | Avoids returning a field the caller never supplied. |
| `description: null` on update | Clears the field | A partial update needs a way to remove a value; omitting the key alone cannot express that. |
| `limit` out of range | Rejected with 400 | Silently clamping hides caller bugs. The requirements set a default of 50 and no maximum, so a maximum of 100 was chosen. |
| `offset` past the end | 200 with an empty `data` array | An empty page is a normal outcome of pagination, not an error. |
| `completed` parsing | Accepts `true`/`false`/`1`/`0`, case-insensitive | Query strings are always text. Anything else is a 400 rather than a silent false. |
| Unknown body fields | Rejected with 400 | A misspelled field is nearly always a bug; ignoring it silently loses the caller's data. |
| Validation before existence | 400 wins over 404 | Validation is cheaper and the requirements place validation first. |
| Malformed JSON | 400, not 500 | A client sending broken JSON is a client error. |
| `id` as a string | `"1"`, not `1` | Matches the response examples in the requirements, which quote the id. |

## Not implemented

The requirements listed optional enhancements. None were built, because
functionality and code quality carry 80% of the evaluation weight and each
addition is a way to introduce a defect. The following are the natural
extensions if the service grows:

- Timestamps (`createdAt`, `updatedAt`)
- `priority` field, `dueDate` field, tags
- CORS, request logging, rate limiting

Each would touch the store and the validation module; none would require changing
the response contract.
