// One envelope, always: { error: { code, message } }. Seven codes.
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

const HTTP: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = HTTP[code];
  }
}

export const notFound = () => new AppError('NOT_FOUND', 'Not found');
export const conflict = (m: string) => new AppError('CONFLICT', m);
export const validation = (m: string) => new AppError('VALIDATION_FAILED', m);

interface MysqlError extends Error {
  code?: string;
  errno?: number;
  sqlMessage?: string;
}

/**
 * Every guarantee the schema enforces will eventually be hit by a real user.
 * A raw driver error is not an answer. In production the message is from this
 * table and nothing else — no SQL, no stack, no constraint names.
 */
export function translateDbError(err: unknown): AppError | null {
  const e = err as MysqlError;
  if (!e || typeof e.code !== 'string') return null;

  const constraint = e.sqlMessage ?? '';

  if (e.code === 'ER_DUP_ENTRY') {
    if (constraint.includes('uq_budget_hh_period_category')) {
      return conflict('That category already has a budget this month');
    }
    if (constraint.includes('uq_txn_swept_from')) {
      return conflict('That month has already been swept');
    }
    return conflict('That already exists');
  }
  if (e.code === 'ER_ROW_IS_REFERENCED_2' || e.code === 'ER_ROW_IS_REFERENCED') {
    return conflict('That category is in use. Archive it instead');
  }
  if (e.code === 'ER_NO_REFERENCED_ROW_2' || e.code === 'ER_NO_REFERENCED_ROW') {
    return validation('That references something that does not exist in this household');
  }
  if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    // The validator should have caught this — log it as a bug upstream.
    return validation('That value is not allowed');
  }
  return null;
}
