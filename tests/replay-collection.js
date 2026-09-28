import fs from 'fs';
import os from 'os';
import path from 'path';
import { createApp } from '../src/app.js';

const collection = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'postman', 'Task_API_Collection.json'), 'utf8'),
);

async function main() {
  const dataFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'task-api-coll-')),
    'tasks.json',
  );
  const server = createApp({ dataFile }).listen(0, '127.0.0.1');
  await new Promise((r) => server.on('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const env = {};
  collection.variable.forEach((v) => {
    env[v.key] = v.value;
  });

  function resolveUrl(item) {
    const raw = item.request.url.raw
      .replace('{{baseUrl}}', base)
      .replace(/\{\{(\w+)\}\}/g, (_, k) => env[k]);
    return new URL(raw);
  }

  async function run(item) {
    const url = resolveUrl(item);
    const init = { method: item.request.method, headers: {} };

    if (item.request.body && item.request.body.mode === 'raw') {
      init.headers['content-type'] = 'application/json';
      init.body = item.request.body.raw;
    }

    const res = await fetch(url, init);
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (res.status === 201 && body && body.data && body.data.id) {
      env.taskId = body.data.id;
    }

    return { status: res.status, body, text };
  }

  let pass = 0;
  let fail = 0;
  const failures = [];

  for (const item of collection.item) {
    let result;
    try {
      result = await run(item);
    } catch (error) {
      fail += 1;
      failures.push(`${item.name}: request threw ${error.message}`);
      continue;
    }

    const problems = [];
    const b = result.body;
    const expect = (cond, msg) => {
      if (!cond) problems.push(msg);
    };

    const expected = {
      'Create Task': 201,
      'Create Task - Validation Error (empty title)': 400,
      'Create Task - Validation Error (missing title)': 400,
      'Create Task - Validation Error (isCompleted not boolean)': 400,
      'Get Task by Id - Not Found (404)': 404,
      'Get Task by Id - Malformed Id (400)': 400,
      'Update Task - Validation Error (empty body)': 400,
      'Update Task - Not Found (404)': 404,
      'Delete Task - Already Deleted (404)': 404,
      'List Tasks - Invalid Limit (400)': 400,
    }[item.name] ?? 200;

    if (result.status !== expected) {
      problems.push(`status ${result.status}, collection expects ${expected}`);
    }

    if (b) {
      if (expected < 400) {
        expect(b.success === true, `success should be true, got ${JSON.stringify(b.success)}`);
        expect(
          'data' in b || 'message' in b,
          'success response carried neither data nor message',
        );
      } else {
        expect(b.success === false, `success should be false, got ${JSON.stringify(b.success)}`);
        expect(!('data' in b), 'error response must not carry a data key');
      }
    }

    switch (item.name) {
      case 'List Tasks':
        expect(Array.isArray(b.data), 'data is not an array');
        expect(b.count === b.data.length, `count ${b.count} != data.length ${b.data.length}`);
        expect('total' in b, 'total is missing');
        break;
      case 'List Tasks - Filtered Completed':
        (b.data || []).forEach((task) =>
          expect(task.isCompleted === true, 'a returned task was not completed'),
        );
        break;
      case 'List Tasks - Paginated':
        expect(b.data.length <= 5, `page returned ${b.data.length} items, limit was 5`);
        break;
      case 'Create Task':
        expect(typeof b.data.id === 'string', 'id is not a string');
        expect(b.data.isCompleted === false, 'isCompleted did not default to false');
        expect(env.taskId === b.data.id, 'taskId variable was not captured');
        break;
      case 'Create Task - Validation Error (empty title)':
        expect(b.details[0].field === 'title', 'first detail field is not title');
        expect(
          b.details[0].message === 'title cannot be empty',
          `unexpected message: ${b.details[0].message}`,
        );
        break;
      case 'Create Task - Validation Error (missing title)':
        expect(
          b.details.some((d) => d.message === 'title is required'),
          'title is required not reported',
        );
        break;
      case 'Create Task - Validation Error (isCompleted not boolean)':
        expect(
          b.details.some((d) => d.message === 'isCompleted must be a boolean'),
          'isCompleted coercion was not rejected',
        );
        break;
      case 'Get Task by Id':
        expect(b.data.id === env.taskId, 'returned id does not match taskId');
        expect(typeof b.data.id === 'string', 'id is not a string');
        expect(typeof b.data.title === 'string', 'title is not a string');
        expect(typeof b.data.isCompleted === 'boolean', 'isCompleted is not a boolean');
        break;
      case 'Get Task by Id - Not Found (404)':
        expect(b.error === "Task with id '999999' not found", `unexpected error: ${b.error}`);
        break;
      case 'Get Task by Id - Malformed Id (400)':
        expect(
          b.details[0].message === 'id must be a positive integer',
          `unexpected message: ${b.details[0].message}`,
        );
        break;
      case 'Update Task - Partial (isCompleted only)':
        expect(b.data.isCompleted === true, 'isCompleted was not updated');
        expect(typeof b.data.title === 'string', 'title was not left untouched');
        break;
      case 'Update Task - Full Replacement':
        expect(b.data.title === 'Buy groceries and cook', 'title was not replaced');
        expect(b.data.description === 'Updated description', 'description was not replaced');
        expect(b.data.isCompleted === true, 'isCompleted was not replaced');
        break;
      case 'Update Task - Validation Error (empty body)':
        expect(
          b.details.some((d) => d.message === 'at least one field must be provided'),
          'empty body not rejected',
        );
        break;
      case 'Delete Task':
        expect(b.message === 'Task deleted successfully', `unexpected message: ${b.message}`);
        break;
      case 'List Tasks - Invalid Limit (400)':
        expect(b.details[0].field === 'limit', `expected field limit, got ${b.details[0].field}`);
        break;
      default:
        break;
    }

    if (problems.length === 0) {
      pass += 1;
      console.log(`  PASS  ${item.name}  [${result.status}]`);
    } else {
      fail += 1;
      failures.push(`${item.name}: ${problems.join('; ')}`);
      console.log(`  FAIL  ${item.name}  [${result.status}]  ${problems.join('; ')}`);
    }
  }

  await new Promise((r) => server.close(r));

  console.log(
    `\ncollection replay: ${pass} passed, ${fail} failed, of ${collection.item.length} requests`,
  );
  if (fail > 0) {
    console.log('\nfailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main();
