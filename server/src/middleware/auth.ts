import type { NextFunction, Request, Response } from 'express';
import { householdIdForUser, findUserById } from '../db/auth-repo.js';
import { AppError } from '../errors.js';
import {
  cookieName,
  cookieOptions,
  shouldReissue,
  signSession,
  verifySession,
} from '../auth/tokens.js';

// The token carries only `sub`. household_id is looked up on every request — one
// indexed read against a two-row table — so a deleted user is rejected now, not
// at token expiry, and there is one source of truth for which household you are in.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[cookieName()];
    if (!token) throw new AppError('UNAUTHENTICATED', 'Not signed in');

    const payload = verifySession(token);
    if (!payload) throw new AppError('UNAUTHENTICATED', 'Session is not valid');

    const user = await findUserById(payload.sub);
    if (!user) throw new AppError('UNAUTHENTICATED', 'Session is not valid');

    const householdId = await householdIdForUser(user.id);
    if (!householdId) throw new AppError('UNAUTHENTICATED', 'No household');

    req.ctx = { userId: user.id, householdId };

    if (shouldReissue(payload)) {
      res.cookie(cookieName(), signSession(user.id), cookieOptions());
    }
    next();
  } catch (err) {
    next(err);
  }
}
