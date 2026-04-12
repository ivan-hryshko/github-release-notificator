import { Router } from 'express';
import { apiKeyAuth } from '../common/auth.middleware.js';
import { register } from './metrics.js';

const metricsRouter = Router();

metricsRouter.get('/metrics', apiKeyAuth, async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

export { metricsRouter };
