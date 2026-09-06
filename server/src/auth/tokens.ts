import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const COOKIE_NAME = 'hl_session';
const LIFETIME_DAYS = 30;
const REISSUE_AFTER_DAYS = 7;

export interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${LIFETIME_DAYS}d`,
  });
}

export function verifySession(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub) return null;
    return decoded as TokenPayload;
  } catch {
    return null;
  }
}

/** Re-issue when the token is more than 7 days old — phones should never see a login form. */
export function shouldReissue(payload: TokenPayload): boolean {
  const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
  return ageSeconds > REISSUE_AFTER_DAYS * 86400;
}

export function cookieName(): string {
  return COOKIE_NAME;
}

export function cookieOptions(): {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.isProd,
    maxAge: LIFETIME_DAYS * 86400 * 1000,
  };
}
