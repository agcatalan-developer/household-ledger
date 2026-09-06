import { z } from 'zod';
import { AppError } from './errors.js';

// Shared primitives, defined once (Phase 3).
export const Period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be YYYY-MM');
export const Uuid = z.string().uuid();
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
/** Positive integer minor units. A string or float is a 400, never a coercion. */
export const Minor = z
  .number({ invalid_type_error: 'must be an integer number of minor units' })
  .int('must be an integer')
  .positive('must be greater than 0');

/**
 * The server-owned field registry (Phase 13). Every field a request body may
 * never set. `.strict()` rejects unknown fields, but these are real columns, so
 * without this list a schema that happened to omit one would silently accept it.
 */
export const SERVER_OWNED = [
  'householdId',
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
  'period',
  'sweptFromPeriod',
] as const;

export function assertNoServerOwned(
  body: unknown,
  opts: { forbidType?: boolean } = {},
): void {
  if (!body || typeof body !== 'object') return;
  const keys = Object.keys(body as Record<string, unknown>);
  const forbidden = new Set<string>(SERVER_OWNED);
  if (opts.forbidType) forbidden.add('type');
  const hit = keys.find((k) => forbidden.has(k));
  if (hit) {
    throw new AppError('VALIDATION_FAILED', `${hit} is set by the server and cannot be in the body`);
  }
}

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  return schema.parse(body);
}

export function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  return schema.parse(query);
}
