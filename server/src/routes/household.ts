import { Router } from 'express';
import { z } from 'zod';
import { withHousehold } from '../db/withHousehold.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { assertNoServerOwned } from '../validation.js';
import { findUserById, updateDisplayName, updatePassword } from '../db/auth-repo.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';

export const householdRouter = Router();
householdRouter.use(requireAuth);

const HouseholdBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter code')
      .transform((s) => s.toUpperCase())
      .optional(),
  })
  .strict();

householdRouter.patch('/', async (req, res, next) => {
  try {
    assertNoServerOwned(req.body);
    const body = HouseholdBody.parse(req.body);
    const household = await withHousehold(req.ctx!, async (r) => {
      await r.household.update(body);
      return r.household.get();
    });
    res.json({ household });
  } catch (err) {
    next(err);
  }
});

export const profileRouter = Router();
profileRouter.use(requireAuth);

const ProfileBody = z
  .object({
    displayName: z.string().min(1).max(80).optional(),
    password: z.string().min(8).optional(),
    currentPassword: z.string().optional(),
  })
  .strict()
  .refine((b) => !b.password || b.currentPassword, {
    message: 'currentPassword is required to change the password',
    path: ['currentPassword'],
  });

profileRouter.patch('/', async (req, res, next) => {
  try {
    assertNoServerOwned(req.body);
    const body = ProfileBody.parse(req.body);
    const ctx = req.ctx!;

    if (body.password) {
      const user = await findUserById(ctx.userId);
      const ok = await verifyPassword(user?.passwordHash ?? null, body.currentPassword ?? '');
      if (!ok) throw new AppError('VALIDATION_FAILED', 'Current password is not right');
      await updatePassword(ctx.userId, await hashPassword(body.password));
    }
    if (body.displayName) {
      await updateDisplayName(ctx.userId, body.displayName);
    }

    const user = await findUserById(ctx.userId);
    res.json({ id: ctx.userId, displayName: user?.displayName ?? '' });
  } catch (err) {
    next(err);
  }
});
