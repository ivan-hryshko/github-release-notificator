import { Router } from 'express';
import { asyncHandler } from '../common/async-handler.js';
import { apiKeyAuth } from '../common/auth.middleware.js';
import { ValidationError } from '../common/errors.js';
import { subscribeSchema, emailQuerySchema, tokenParamSchema } from './subscription.validator.js';
import * as service from './subscription.service.js';
import { createConfirmationNotification } from '../notifier/notifier.repository.js';

const router = Router();

router.post(
  '/subscribe',
  apiKeyAuth,
  asyncHandler(async (req, res) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0].message);
    }

    const { email, repo } = parsed.data;
    const result = await service.subscribe(email, repo);

    if (result.isNew) {
      await createConfirmationNotification(result.subscription.id);
    }

    res.status(200).json({ message: 'Subscription successful. Please check your email (including spam folder) to confirm.' });
  }),
);

router.get(
  '/confirm/:token',
  asyncHandler(async (req, res) => {
    const parsed = tokenParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid token');
    }

    await service.confirmSubscription(parsed.data.token);
    res.status(200).json({ message: 'Subscription confirmed successfully' });
  }),
);

router.get(
  '/unsubscribe/:token',
  asyncHandler(async (req, res) => {
    const parsed = tokenParamSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new ValidationError('Invalid token');
    }

    await service.unsubscribe(parsed.data.token);
    res.status(200).json({ message: 'Unsubscribed successfully' });
  }),
);

router.get(
  '/subscriptions',
  apiKeyAuth,
  asyncHandler(async (req, res) => {
    const parsed = emailQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError('Invalid email');
    }

    const subs = await service.getSubscriptions(parsed.data.email);
    res.status(200).json(subs);
  }),
);

export { router as subscriptionRouter };
