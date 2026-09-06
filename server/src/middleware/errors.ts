import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, translateDbError } from '../errors.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
}

// The single place a thrown error becomes a response. In production the message
// is from AppError / the translation table only — no SQL, no stack, no
// constraint names. A 500 is logged with the request id and nothing else.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first?.path.join('.');
    const message = first ? `${path ? `${path}: ` : ''}${first.message}` : 'Invalid request';
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message } });
    return;
  }

  const translated = translateDbError(err);
  if (translated) {
    res.status(translated.status).json({ error: { code: translated.code, message: translated.message } });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      requestId: req.requestId,
      level: 'error',
      errorClass: (err as Error)?.name ?? 'Error',
    }),
  );
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
