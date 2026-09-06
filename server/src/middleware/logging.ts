import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// One line per request, an allowlist not a denylist (Phase 13): request_id,
// method, path, status, duration, user_id. Nothing else, ever — no amounts,
// emails, notes, category names, tokens.
export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = {
      requestId: req.requestId,
      method: req.method,
      path: req.route ? req.baseUrl + req.route.path : req.path,
      status: res.statusCode,
      durationMs: Math.round(ms * 10) / 10,
      userId: req.ctx?.userId ?? null,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(line));
  });
  next();
}
