import express from 'express';
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} from '../controllers/taskController.js';

export function createTaskRouter(store) {
  const router = express.Router();

  router.get('/', listTasks(store));
  router.post('/', createTask(store));
  router.get('/:id', getTask(store));
  router.put('/:id', updateTask(store));
  router.delete('/:id', deleteTask(store));

  return router;
}
