import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../src/app.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'task-api-test-'));
let fileCounter = 0;

function freshDataFile() {
  fileCounter += 1;
  return path.join(tmpRoot, `data-${fileCounter}.json`);
}

async function withServer(dataFile) {
  const app = createApp({ dataFile: dataFile || freshDataFile() });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const base = `http://127.0.0.1:${server.address().port}`;

  const request = async (method, urlPath, body) => {
    const init = { method, headers: {} };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(`${base}${urlPath}`, init);
    const text = await res.text();
    let json = null;
    try {
      json = text === '' ? null : JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, body: json, text };
  };

  return {
    request,
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    del: (p) => request('DELETE', p),
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const ALLOWED_STATUSES = new Set([200, 201, 400, 404, 500]);
const observedStatuses = [];

function track(res) {
  observedStatuses.push(res.status);
  return res;
}

const createTask = async (api, overrides = {}) =>
  track(await api.post('/tasks', { title: 'Buy groceries', ...overrides }));

test('Gate 1: GET /tasks on an empty store returns an empty page', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const res = track(await api.get('/tasks'));
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data, []);
  assert.equal(res.body.count, 0);
  assert.equal(res.body.total, 0);
});

test('Gate 1: count reflects the page and total reflects the filtered set', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  for (let i = 0; i < 5; i += 1) {
    await createTask(api, { title: `Task ${i}` });
  }

  const all = track(await api.get('/tasks'));
  assert.equal(all.status, 200);
  assert.equal(all.body.count, 5);
  assert.equal(all.body.total, 5);
  assert.equal(all.body.count, all.body.data.length);

  const page = track(await api.get('/tasks?limit=2'));
  assert.equal(page.body.count, 2);
  assert.equal(page.body.total, 5);
});

test('Gate 1: completed filter works in both directions', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const open = await createTask(api, { title: 'Open task' });
  const done = await createTask(api, { title: 'Done task', isCompleted: true });
  const other = await createTask(api, { title: 'Another open', isCompleted: false });

  const completed = track(await api.get('/tasks?completed=true'));
  assert.equal(completed.status, 200);
  assert.equal(completed.body.total, 1);
  assert.deepEqual(completed.body.data.map((task) => task.id), [done.body.data.id]);

  const incomplete = track(await api.get('/tasks?completed=false'));
  assert.equal(incomplete.body.total, 2);
  assert.deepEqual(
    incomplete.body.data.map((task) => task.id).sort(),
    [open.body.data.id, other.body.data.id].sort(),
  );
});

test('Gate 1: completed accepts true, false, 1, 0 case-insensitively', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  await createTask(api, { title: 'Done', isCompleted: true });
  await createTask(api, { title: 'Open' });

  for (const value of ['true', 'TRUE', 'True', '1']) {
    const res = track(await api.get(`/tasks?completed=${value}`));
    assert.equal(res.status, 200, `completed=${value} should be accepted`);
    assert.equal(res.body.total, 1);
  }

  for (const value of ['false', 'FALSE', '0']) {
    const res = track(await api.get(`/tasks?completed=${value}`));
    assert.equal(res.status, 200, `completed=${value} should be accepted`);
    assert.equal(res.body.total, 1);
  }
});

test('Gate 1: pagination slices the collection', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const ids = [];
  for (let i = 0; i < 5; i += 1) {
    const res = await createTask(api, { title: `Task ${i}` });
    ids.push(res.body.data.id);
  }

  const page1 = track(await api.get('/tasks?limit=2&offset=0'));
  assert.deepEqual(page1.body.data.map((task) => task.id), [ids[0], ids[1]]);

  const page3 = track(await api.get('/tasks?limit=2&offset=4'));
  assert.equal(page3.body.count, 1);
  assert.equal(page3.body.total, 5);
  assert.deepEqual(page3.body.data.map((task) => task.id), [ids[4]]);
});

test('Gate 1: an offset past the end is an empty page, not an error', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  await createTask(api);

  const res = track(await api.get('/tasks?offset=99'));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
  assert.equal(res.body.count, 0);
  assert.equal(res.body.total, 1);
});

test('Gate 1: invalid query parameters return 400 with details', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  for (const query of [
    'limit=0',
    'limit=-1',
    'limit=101',
    'limit=abc',
    'limit=1.5',
    'offset=-1',
    'completed=maybe',
  ]) {
    const res = track(await api.get(`/tasks?${query}`));
    assert.equal(res.status, 400, `${query} should be rejected`);
    assert.equal(res.body.success, false);
    assert.ok(Array.isArray(res.body.details) && res.body.details.length > 0);
  }
});

test('Gate 1: limit at the boundary is accepted', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  for (const value of ['1', '100']) {
    const res = track(await api.get(`/tasks?limit=${value}`));
    assert.equal(res.status, 200, `limit=${value} is in range`);
  }
});

test('Gate 2: GET /tasks/{id} returns the task with all fields', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api, { description: 'Milk, eggs, bread' });

  const res = track(await api.get(`/tasks/${created.body.data.id}`));
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.id, created.body.data.id);
  assert.equal(res.body.data.title, 'Buy groceries');
  assert.equal(res.body.data.description, 'Milk, eggs, bread');
  assert.equal(res.body.data.isCompleted, false);
});

test('Gate 2: an unknown but well-formed id returns 404 with the exact message', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const res = track(await api.get('/tasks/999999'));
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, "Task with id '999999' not found");
});

test('Gate 2: a malformed id returns 400, not 404', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  for (const id of ['abc', '0', '-1', '1.5', 'null']) {
    const res = track(await api.get(`/tasks/${id}`));
    assert.equal(res.status, 400, `id ${id} is malformed`);
    assert.equal(res.body.details[0].message, 'id must be a positive integer');
  }
});

test('Gate 3: a valid task is created with a generated id and defaults', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const res = await createTask(api, { description: 'Milk, eggs, bread' });
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.id);
  assert.equal(res.body.data.title, 'Buy groceries');
  assert.equal(res.body.data.isCompleted, false);
  assert.equal(res.body.data.description, 'Milk, eggs, bread');
});

test('Gate 3: description is omitted when absent and when explicitly null', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const withoutDesc = await createTask(api);
  assert.equal(withoutDesc.status, 201);
  assert.equal('description' in withoutDesc.body.data, false);

  const withNull = await createTask(api, { description: null });
  assert.equal(withNull.status, 201);
  assert.equal('description' in withNull.body.data, false);
});

test('Gate 3: a missing title is a 400 with details', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  for (const body of [{}, { description: 'no title here' }]) {
    const res = track(await api.post('/tasks', body));
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Validation failed');
    assert.equal(res.body.details[0].field, 'title');
    assert.equal(res.body.details[0].message, 'title is required');
  }
});

test('Gate 3: empty and whitespace-only titles are rejected after trimming', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  for (const title of ['', '   ', '\t\n  ']) {
    const res = track(await api.post('/tasks', { title }));
    assert.equal(res.status, 400, `title ${JSON.stringify(title)} should be rejected`);
    assert.equal(res.body.details[0].message, 'title cannot be empty');
  }
});

test('Gate 3: a non-string title is rejected without coercion', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  for (const title of [123, true, ['a'], { nested: true }]) {
    const res = track(await api.post('/tasks', { title }));
    assert.equal(res.status, 400);
    assert.equal(res.body.details[0].message, 'title must be a string');
  }
});

test('Gate 3: the title length boundary is 200 characters', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const ok = track(await api.post('/tasks', { title: 'a'.repeat(200) }));
  assert.equal(ok.status, 201);

  const tooLong = track(await api.post('/tasks', { title: 'a'.repeat(201) }));
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.body.details[0].message, 'title must be at most 200 characters');
});

test('Gate 3: the description length boundary is 1000 characters', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const ok = track(await api.post('/tasks', { title: 'ok', description: 'b'.repeat(1000) }));
  assert.equal(ok.status, 201);

  const tooLong = track(await api.post('/tasks', { title: 'ok', description: 'b'.repeat(1001) }));
  assert.equal(tooLong.status, 400);
  assert.equal(
    tooLong.body.details[0].message,
    'description must be at most 1000 characters',
  );
});

test('Gate 3: length is checked after trimming, so padding cannot sneak past', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const res = track(await api.post('/tasks', { title: `  ${'a'.repeat(200)}  ` }));
  assert.equal(res.status, 201, 'padding around a legal title is trimmed, not counted');
  assert.equal(res.body.data.title.length, 200);

  const padded = track(await api.post('/tasks', { title: `${'a'.repeat(201)}   ` }));
  assert.equal(padded.status, 400, 'padding cannot rescue an over-long title');
});

test('Gate 3: isCompleted must be a real boolean', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  for (const value of ['true', 'false', 1, 0, 'yes']) {
    const res = track(await api.post('/tasks', { title: 'x', isCompleted: value }));
    assert.equal(res.status, 400, `isCompleted ${JSON.stringify(value)} must be rejected`);
    assert.equal(res.body.details[0].message, 'isCompleted must be a boolean');
  }

  const good = track(await api.post('/tasks', { title: 'x', isCompleted: true }));
  assert.equal(good.status, 201);
  assert.equal(good.body.data.isCompleted, true);
});

test('Gate 3: every field error is reported in one pass', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const res = track(
    await api.post('/tasks', { title: '  ', description: 'c'.repeat(1001) }),
  );
  assert.equal(res.status, 400);
  assert.equal(res.body.details.length, 2);
  assert.deepEqual(res.body.details.map((d) => d.field).sort(), ['description', 'title']);
});

test('Gate 3: unknown top-level keys are rejected', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const res = track(await api.post('/tasks', { title: 'x', color: 'red' }));
  assert.equal(res.status, 400);
  assert.equal(res.body.details[0].message, "unknown field 'color'");
});

test('Gate 3: malformed and non-object bodies are 400', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const malformed = track(await api.post('/tasks', '{ not json'));
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.success, false);

  for (const body of [[], [1, 2], 'a string', 42, true]) {
    const res = track(await api.post('/tasks', body));
    assert.equal(res.status, 400, `body ${JSON.stringify(body)} should be rejected`);
    assert.equal(res.body.success, false);
  }
});

test('Gate 3: consecutive creates receive distinct ids', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const ids = new Set();
  for (let i = 0; i < 5; i += 1) {
    const res = await createTask(api, { title: `Task ${i}` });
    ids.add(res.body.data.id);
  }
  assert.equal(ids.size, 5);
});

test('Gate 4: a partial update leaves omitted fields untouched', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api, { description: 'original' });
  const { id, title, description } = created.body.data;

  const res = track(await api.put(`/tasks/${id}`, { isCompleted: true }));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.isCompleted, true);
  assert.equal(res.body.data.title, title, 'title must be unchanged');
  assert.equal(res.body.data.description, description, 'description must be unchanged');
});

test('Gate 4: a full update replaces all provided fields', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api);
  const res = track(
    await api.put(`/tasks/${created.body.data.id}`, {
      title: 'Buy groceries and cook',
      description: 'Updated description',
      isCompleted: true,
    }),
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.data.title, 'Buy groceries and cook');
  assert.equal(res.body.data.description, 'Updated description');
  assert.equal(res.body.data.isCompleted, true);
});

test('Gate 4: an explicit null description clears the field', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api, { description: 'to be cleared' });
  const res = track(await api.put(`/tasks/${created.body.data.id}`, { description: null }));

  assert.equal(res.status, 200);
  assert.equal('description' in res.body.data, false);

  const reread = track(await api.get(`/tasks/${created.body.data.id}`));
  assert.equal('description' in reread.body.data, false, 'clear must be persisted');
});

test('Gate 4: an empty update body is rejected', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api);

  for (const body of [{}, { unknown: 'field' }]) {
    const res = track(await api.put(`/tasks/${created.body.data.id}`, body));
    assert.equal(res.status, 400);
    assert.ok(res.body.details.some((d) => d.message === 'at least one field must be provided'));
  }
});

test('Gate 4: the same field rules apply on update as on create', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api);
  const { id } = created.body.data;

  const cases = [
    [{ title: '  ' }, 'title cannot be empty'],
    [{ title: 'a'.repeat(201) }, 'title must be at most 200 characters'],
    [{ title: 42 }, 'title must be a string'],
    [{ description: 'b'.repeat(1001) }, 'description must be at most 1000 characters'],
    [{ isCompleted: 'yes' }, 'isCompleted must be a boolean'],
  ];

  for (const [body, expected] of cases) {
    const res = track(await api.put(`/tasks/${id}`, body));
    assert.equal(res.status, 400, `${JSON.stringify(body)} should be rejected`);
    assert.ok(
      res.body.details.some((d) => d.message === expected),
      `expected "${expected}", got ${JSON.stringify(res.body.details)}`,
    );
  }
});

test('Gate 4: an unknown id is 404 and a malformed id is 400', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const unknown = track(await api.put('/tasks/999999', { isCompleted: true }));
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, "Task with id '999999' not found");

  const malformed = track(await api.put('/tasks/abc', { isCompleted: true }));
  assert.equal(malformed.status, 400);
});

test('Gate 4: validation precedes the existence check', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const res = track(await api.put('/tasks/999999', { title: '' }));
  assert.equal(res.status, 400, 'an invalid field plus an unknown id is a validation error');
  assert.equal(res.body.details[0].message, 'title cannot be empty');
});

test('Gate 4: an update is visible on the next read', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api);
  const { id } = created.body.data;

  await api.put(`/tasks/${id}`, { title: 'Renamed' });

  const reread = track(await api.get(`/tasks/${id}`));
  assert.equal(reread.body.data.title, 'Renamed');
});

test('Gate 5: deleting a task succeeds and returns the success message', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api);
  const { id } = created.body.data;

  const res = track(await api.del(`/tasks/${id}`));
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.message, 'Task deleted successfully');

  const reread = track(await api.get(`/tasks/${id}`));
  assert.equal(reread.status, 404);

  const again = track(await api.del(`/tasks/${id}`));
  assert.equal(again.status, 404);
});

test('Gate 5: deleting an unknown id is 404 and a malformed id is 400', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const unknown = track(await api.del('/tasks/999999'));
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, "Task with id '999999' not found");

  const malformed = track(await api.del('/tasks/abc'));
  assert.equal(malformed.status, 400);
});

test('Gate 5: collection totals reflect a deletion', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const first = await createTask(api, { title: 'One' });
  await createTask(api, { title: 'Two' });

  assert.equal((await api.get('/tasks')).body.total, 2);

  await api.del(`/tasks/${first.body.data.id}`);

  const after = track(await api.get('/tasks'));
  assert.equal(after.body.total, 1);
  assert.equal(after.body.count, 1);
});

test('Gate 6: no response body leaks internals', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api);

  const responses = [
    await api.get('/tasks'),
    await api.get('/tasks/999999'),
    await api.get('/tasks/abc'),
    await api.get('/tasks?limit=999'),
    await api.get('/tasks/nope'),
    await api.post('/tasks', { title: '' }),
    await api.put(`/tasks/${created.body.data.id}`, {}),
    await api.del(`/tasks/${created.body.data.id}`),
  ];

  const forbidden = ['    at ', 'Error:', '.js:', '.json:', 'node_modules', 'Express'];

  for (const res of responses) {
    for (const needle of forbidden) {
      assert.ok(
        !res.text.includes(needle),
        `response leaked ${JSON.stringify(needle)}: ${res.text.slice(0, 200)}`,
      );
    }
  }
});

test('Gate 6: every error body has success false and a non-empty error string', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const responses = [
    await api.get('/tasks/999999'),
    await api.get('/tasks/abc'),
    await api.post('/tasks', {}),
    await api.put('/tasks/1', {}),
    await api.del('/tasks/999999'),
    await api.get('/tasks/does-not-exist'),
  ];

  for (const res of responses) {
    assert.equal(res.body.success, false);
    assert.equal(typeof res.body.error, 'string');
    assert.ok(res.body.error.length > 0);
  }
});

test('Gate 6: a storage failure yields a safe 500', async (t) => {
  const blockedRoot = path.join(tmpRoot, `blocked-${fileCounter++}`);
  fs.writeFileSync(blockedRoot, 'not a directory', 'utf8');

  const api = await withServer(path.join(blockedRoot, 'tasks.json'));
  t.after(() => api.close());

  const res = track(await api.post('/tasks', { title: 'Will fail to persist' }));
  assert.equal(res.status, 500);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, 'Internal server error');
  assert.ok(!res.text.includes('ENOTDIR'), 'the OS error code must not reach the client');
  assert.ok(!res.text.includes('  at '), 'no stack frames');
});

test('Gate 6: data survives a restart', async (t) => {
  const dataFile = freshDataFile();

  const first = await withServer(dataFile);
  const created = await createTask(first, { title: 'Persisted', description: 'kept' });
  const { id } = created.body.data;
  await first.close();

  const second = await withServer(dataFile);
  t.after(() => second.close());

  const reread = track(await second.get(`/tasks/${id}`));
  assert.equal(reread.status, 200);
  assert.equal(reread.body.data.title, 'Persisted');
  assert.equal(reread.body.data.description, 'kept');

  const nextCreate = await createTask(second, { title: 'After restart' });
  assert.notEqual(nextCreate.body.data.id, id, 'ids must not collide after a restart');
});

test('Gate 6: an unmatched route returns the standard 404 envelope', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const res = track(await api.get('/not-a-route'));
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.ok(res.body.error.includes('not found'));
});

test('Gate 6: only contractual status codes are ever emitted', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api);
  const { id } = created.body.data;

  await api.get('/tasks');
  await api.get('/tasks?limit=0');
  await api.get(`/tasks/${id}`);
  await api.get('/tasks/999999');
  await api.post('/tasks', { title: 'ok' });
  await api.post('/tasks', {});
  await api.put(`/tasks/${id}`, { title: 'renamed' });
  await api.put(`/tasks/${id}`, {});
  await api.put('/tasks/999999', { title: 'renamed' });
  await api.del(`/tasks/${id}`);
  await api.del(`/tasks/${id}`);

  const strays = observedStatuses.filter((status) => !ALLOWED_STATUSES.has(status));
  assert.deepEqual(strays, [], `unexpected status codes: ${strays.join(', ')}`);
  assert.ok(observedStatuses.length >= 12, 'expected the full request surface to be exercised');
});

test('Gate 6: every success response carries data and every error carries error', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const created = await createTask(api);
  const { id } = created.body.data;

  const successes = [
    await api.get('/tasks'),
    await api.get(`/tasks/${id}`),
    await api.put(`/tasks/${id}`, { isCompleted: true }),
  ];

  for (const res of successes) {
    assert.equal(res.body.success, true);
    assert.ok('data' in res.body, 'success responses must carry data');
  }

  const errors = [await api.get('/tasks/999999'), await api.post('/tasks', {})];
  for (const res of errors) {
    assert.equal(res.body.success, false);
    assert.ok('error' in res.body, 'error responses must carry error');
    assert.ok(!('data' in res.body), 'error responses must not carry data');
  }
});

test('Gate 6: health endpoint responds', async (t) => {
  const api = await withServer();
  t.after(() => api.close());

  const res = track(await api.get('/health'));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'ok');
});
