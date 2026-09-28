import express from 'express';
import { createTaskRouter } from './routes/taskRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { TaskStore } from './storage/taskStore.js';

export function createApp({ dataFile }) {
  const store = new TaskStore(dataFile).load();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  app.use('/tasks', createTaskRouter(store));

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.store = store;
  return app;
}
