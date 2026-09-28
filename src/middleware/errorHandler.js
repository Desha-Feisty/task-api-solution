export class HttpError extends Error {
  constructor(status, error, details) {
    super(error);
    this.name = 'HttpError';
    this.status = status;
    this.expose = true;
    this.details = details;
  }
}

export const notFound = (id) => new HttpError(404, `Task with id '${id}' not found`);

export const validationFailed = (details) => new HttpError(400, 'Validation failed', details);

export function errorHandler(err, req, res, _next) {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Malformed JSON request body' });
  }

  if (err && err.expose === true && typeof err.status === 'number') {
    const body = { success: false, error: err.message };
    if (Array.isArray(err.details) && err.details.length > 0) {
      body.details = err.details;
    }
    return res.status(err.status).json(body);
  }

  console.error('[task-api] unhandled error:', err);
  return res.status(500).json({ success: false, error: 'Internal server error' });
}
