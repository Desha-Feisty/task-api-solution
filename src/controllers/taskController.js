import { serializeTask } from '../models/Task.js';
import { notFound, validationFailed } from '../middleware/errorHandler.js';
import {
  parseTaskId,
  parseListQuery,
  validateCreate,
  validateUpdate,
} from '../validation/taskValidation.js';

const okData = (res, data, status = 200) => res.status(status).json({ success: true, data });

const okCollection = (res, { page, total }) =>
  res.status(200).json({
    success: true,
    data: page.map(serializeTask),
    count: page.length,
    total,
  });

const okMessage = (res, message) => res.status(200).json({ success: true, message });

function requireTaskId(raw) {
  const { errors, id } = parseTaskId(raw);
  if (errors.length > 0) throw validationFailed(errors);
  return id;
}

export function listTasks(store) {
  return (req, res, next) => {
    try {
      const { errors, filters } = parseListQuery(req.query);
      if (errors.length > 0) throw validationFailed(errors);

      return okCollection(res, store.list(filters));
    } catch (error) {
      return next(error);
    }
  };
}

export function getTask(store) {
  return (req, res, next) => {
    try {
      const id = requireTaskId(req.params.id);
      const task = store.findById(id);
      if (!task) throw notFound(id);

      return okData(res, serializeTask(task));
    } catch (error) {
      return next(error);
    }
  };
}

export function createTask(store) {
  return (req, res, next) => {
    try {
      const { errors, value } = validateCreate(req.body);
      if (errors.length > 0) throw validationFailed(errors);

      return okData(res, serializeTask(store.create(value)), 201);
    } catch (error) {
      return next(error);
    }
  };
}

export function updateTask(store) {
  return (req, res, next) => {
    try {
      const { errors, value } = validateUpdate(req.body);
      if (errors.length > 0) throw validationFailed(errors);

      const id = requireTaskId(req.params.id);
      const task = store.update(id, value);
      if (!task) throw notFound(id);

      return okData(res, serializeTask(task));
    } catch (error) {
      return next(error);
    }
  };
}

export function deleteTask(store) {
  return (req, res, next) => {
    try {
      const id = requireTaskId(req.params.id);
      if (!store.remove(id)) throw notFound(id);

      return okMessage(res, 'Task deleted successfully');
    } catch (error) {
      return next(error);
    }
  };
}
