import path from 'path';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.DATA_FILE || path.join(import.meta.dirname, '..', 'data', 'tasks.json');

const app = createApp({ dataFile: DATA_FILE });

app.listen(PORT, HOST, () => {
  console.log(`task-api listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
