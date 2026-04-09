import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pinoHttp from 'pino-http';
import { logger } from './common/logger.js';
import { errorHandler } from './common/error-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

// Static HTML page
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok 6' });
});

// TODO: Mount API routes here in Phase 2
// app.use('/api', apiRouter);

// Error handler (must be last)
app.use(errorHandler);

export { app };
