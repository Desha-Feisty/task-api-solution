import {
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  LIMIT_DEFAULT,
  LIMIT_MAX,
  OFFSET_DEFAULT,
  WRITABLE_FIELDS,
} from '../models/Task.js';

class Details {
  constructor() {
    this.entries = [];
  }

  add(field, message) {
    this.entries.push({ field, message });
    return this;
  }

  get ok() {
    return this.entries.length === 0;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStrictInteger(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validateTitle(value, details) {
  if (typeof value !== 'string') {
    details.add('title', 'title must be a string');
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    details.add('title', 'title cannot be empty');
    return null;
  }

  if (trimmed.length > TITLE_MAX_LENGTH) {
    details.add('title', `title must be at most ${TITLE_MAX_LENGTH} characters`);
    return null;
  }

  return trimmed;
}

function validateDescription(value, details) {
  if (value === null || value === undefined) return null;

  if (typeof value !== 'string') {
    details.add('description', 'description must be a string');
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
    details.add(
      'description',
      `description must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
    );
    return null;
  }

  return trimmed;
}

function validateIsCompleted(value, details) {
  if (typeof value !== 'boolean') {
    details.add('isCompleted', 'isCompleted must be a boolean');
    return null;
  }

  return value;
}

function rejectUnknownFields(body, details) {
  for (const key of Object.keys(body)) {
    if (!WRITABLE_FIELDS.includes(key)) {
      details.add(key, `unknown field '${key}'`);
    }
  }
}

export function validateCreate(body) {
  const details = new Details();

  if (!isPlainObject(body)) {
    details.add('body', 'request body must be a JSON object');
    return { errors: details.entries, value: null };
  }

  rejectUnknownFields(body, details);

  let title;
  if (!Object.prototype.hasOwnProperty.call(body, 'title') || body.title === undefined) {
    details.add('title', 'title is required');
  } else {
    title = validateTitle(body.title, details);
  }

  const hasDescription =
    Object.prototype.hasOwnProperty.call(body, 'description') && body.description !== undefined;
  const description = hasDescription ? validateDescription(body.description, details) : null;

  let isCompleted = false;
  if (Object.prototype.hasOwnProperty.call(body, 'isCompleted') && body.isCompleted !== undefined) {
    const parsed = validateIsCompleted(body.isCompleted, details);
    if (parsed !== null) isCompleted = parsed;
  }

  return {
    errors: details.entries,
    value: { title, description, isCompleted },
  };
}

export function validateUpdate(body) {
  const details = new Details();

  if (!isPlainObject(body)) {
    details.add('body', 'request body must be a JSON object');
    return { errors: details.entries, value: null };
  }

  rejectUnknownFields(body, details);

  const has = (key) => Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;
  const provided = WRITABLE_FIELDS.filter(has);

  if (provided.length === 0) {
    details.add('body', 'at least one field must be provided');
    return { errors: details.entries, value: null };
  }

  const patch = {};

  if (has('title')) {
    const title = validateTitle(body.title, details);
    if (title !== null) patch.title = title;
  }

  if (has('description')) {
    patch.description =
      body.description === null ? null : validateDescription(body.description, details);
  }

  if (has('isCompleted')) {
    const isCompleted = validateIsCompleted(body.isCompleted, details);
    if (isCompleted !== null) patch.isCompleted = isCompleted;
  }

  return { errors: details.entries, value: patch };
}

export function parseTaskId(raw) {
  const parsed = parseStrictInteger(raw);

  if (parsed === null || parsed < 1) {
    return { errors: [{ field: 'id', message: 'id must be a positive integer' }], id: null };
  }

  return { errors: [], id: parsed };
}

export function parseListQuery(query) {
  const details = new Details();
  const filters = {
    completed: null,
    limit: LIMIT_DEFAULT,
    offset: OFFSET_DEFAULT,
  };

  if (query.completed !== undefined) {
    const raw = String(query.completed).trim().toLowerCase();
    if (raw === 'true' || raw === '1') {
      filters.completed = true;
    } else if (raw === 'false' || raw === '0') {
      filters.completed = false;
    } else {
      details.add('completed', 'completed must be one of true, false, 1, 0');
    }
  }

  if (query.limit !== undefined) {
    const limit = parseStrictInteger(String(query.limit));
    if (limit === null || limit < 1 || limit > LIMIT_MAX) {
      details.add('limit', `limit must be an integer between 1 and ${LIMIT_MAX}`);
    } else {
      filters.limit = limit;
    }
  }

  if (query.offset !== undefined) {
    const offset = parseStrictInteger(String(query.offset));
    if (offset === null || offset < 0) {
      details.add('offset', 'offset must be a non-negative integer');
    } else {
      filters.offset = offset;
    }
  }

  return { errors: details.entries, filters };
}
