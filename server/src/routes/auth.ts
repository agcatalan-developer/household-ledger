import { Router } from 'express';
import { z } from 'zod';
import { findUserByEmail, householdIdForUser } from '../db/auth-repo.js';
import { verifyPassword } from '../auth/passwords.js';
import { cookieName, cookieOptions, signSession } from '../auth/tokens.js';
import { withHousehold } from '../db/withHousehold.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { loginRateLimit } from '../middleware/rateLimit.js';

const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) }).strict();

export const authRouter = Router();

authRouter.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const { email, password } = LoginBody.parse(req.body);
    const user = await findUserByEmail(email);
    const ok = await verifyPassword(user?.passwordHash ?? null, password);
    if (!user || !ok) throw new AppError('INVALID_CREDENTIALS', 'Email or password is not right');

    const householdId = await householdIdForUser(user.id);
    if (!householdId) throw new AppError('INVALID_CREDENTIALS', 'Email or password is not right');

    res.cookie(cookieName(), signSession(user.id), cookieOptions());
    const household = await withHousehold({ userId: user.id, householdId }, (r) => r.household.get());
    res.json({ id: user.id, displayName: user.displayName, household });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(cookieName(), { ...cookieOptions(), maxAge: undefined });
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const ctx = req.ctx!;
    const [household, members] = await withHousehold(ctx, async (r) => [
      await r.household.get(),
      await r.household.members(),
    ]);
    const me = members.find((m) => m.userId === ctx.userId);
    res.json({
      id: ctx.userId,
      displayName: me?.displayName ?? '',
      household: {
        ...household,
        // The client needs both names for the paid-by toggle and the read-only
        // member list on Settings (§12); there is no separate members endpoint.
        members: members.map((m) => ({ id: m.userId, displayName: m.displayName, role: m.role })),
      },
    });
  } catch (err) {
    next(err);
  }
});
