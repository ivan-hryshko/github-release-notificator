import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pinoHttpModule from 'pino-http';
const pinoHttp = pinoHttpModule.default ?? pinoHttpModule;
import { logger } from './common/logger.js';
import { errorHandler } from './common/error-handler.js';
import { env } from './config/env.js';
import { subscriptionRouter } from './subscription/subscription.router.js';
import { metricsMiddleware } from './metrics/metrics.middleware.js';
import { metricsRouter } from './metrics/metrics.router.js';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(metricsMiddleware);

// Static HTML page
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API routes
app.use('/api', subscriptionRouter);

// Swagger UI — override host/schemes at runtime (contract YAML stays untouched)
const swaggerDoc = YAML.load(path.join(__dirname, 'swagger', 'api.yaml'));
swaggerDoc.host = `localhost:${env.PORT}`;
swaggerDoc.schemes = ['http'];
swaggerDoc.securityDefinitions = {
  ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
};
swaggerDoc.security = [{ ApiKeyAuth: [] }];
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// Metrics endpoint
app.use(metricsRouter);

// Error handler (must be last)
app.use(errorHandler);

export { app };
