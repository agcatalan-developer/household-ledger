import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';

// 5 attempts / 15 minutes per IP, in-memory. Single process, so a restart
// clears it — acceptable, and a shared store would be the only piece of
// infrastructure in the build (Phase 3).
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const hits = new Map<string, number[]>();

export function loginRateLimit(req: Request, _res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    hits.set(ip, recent);
    next(new AppError('RATE_LIMITED', 'Too many attempts. Try again in a few minutes.'));
    return;
  }
  recent.push(now);
  hits.set(ip, recent);
  next();
}

export function resetRateLimit(): void {
  hits.clear();
}
