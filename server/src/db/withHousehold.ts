// The only way to obtain a repository. It reads household_id from the
// authenticated session (ctx) and mints a repository closed over it. Repository
// methods never accept household_id — there is no parameter to pass it to, and
// no route handler can reach one. This is the entire tenancy control; there is
// no database backstop (Phase 2).
import { pool } from './pool.js';
import { makeRepository, type Repository } from './repository.js';
import type { Ctx } from './types.js';

export type ScopedRepository = Repository & {
  /** Wraps a multi-statement write (copy, sweep) in one transaction. */
  tx<R>(fn: (repo: Repository) => Promise<R>): Promise<R>;
};

export async function withHousehold<T>(
  ctx: Ctx,
  fn: (repo: ScopedRepository) => Promise<T>,
): Promise<T> {
  const base = makeRepository(pool, ctx.householdId);

  const scoped: ScopedRepository = Object.assign(base, {
    async tx<R>(inner: (repo: Repository) => Promise<R>): Promise<R> {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const txRepo = makeRepository(conn, ctx.householdId);
        const result = await inner(txRepo);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
      } finally {
        conn.release();
      }
    },
  });

  return fn(scoped);
}
