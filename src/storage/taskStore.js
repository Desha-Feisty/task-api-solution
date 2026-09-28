import fs from 'fs';
import path from 'path';

export class TaskStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.tasks = [];
    this.nextId = 1;
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      this.tasks = [];
      this.nextId = 1;
      return this;
    }

    let raw;
    try {
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (error) {
      throw new Error('failed to read task data', { cause: error });
    }

    if (raw.trim() === '') {
      this.tasks = [];
      this.nextId = 1;
      return this;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error('task data is not valid JSON', { cause: error });
    }

    if (!Array.isArray(parsed)) {
      throw new Error('task data must be an array');
    }

    this.tasks = parsed;
    this.nextId = parsed.reduce((max, task) => Math.max(max, Number(task.id) || 0), 0) + 1;
    return this;
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.tasks, null, 2), 'utf8');
    } catch (error) {
      throw new Error('failed to write task data', { cause: error });
    }
  }

  list({ completed, limit, offset }) {
    const matched =
      completed === null || completed === undefined
        ? this.tasks
        : this.tasks.filter((task) => Boolean(task.isCompleted) === completed);

    return { page: matched.slice(offset, offset + limit), total: matched.length };
  }

  findById(id) {
    return this.tasks.find((task) => Number(task.id) === id) || null;
  }

  create({ title, description, isCompleted }) {
    const task = {
      id: this.nextId,
      title,
      description: description === undefined ? null : description,
      isCompleted,
    };

    this.tasks.push(task);
    this.nextId += 1;
    this.persist();

    return task;
  }

  update(id, patch) {
    const task = this.findById(id);
    if (!task) return null;

    for (const [key, value] of Object.entries(patch)) {
      task[key] = value;
    }

    this.persist();
    return task;
  }

  remove(id) {
    const index = this.tasks.findIndex((task) => Number(task.id) === id);
    if (index === -1) return false;

    this.tasks.splice(index, 1);
    this.persist();
    return true;
  }
}
