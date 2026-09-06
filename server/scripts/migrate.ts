import { runMigrations } from '../src/db/migrate.js';
import { pool } from '../src/db/pool.js';

runMigrations((m) => console.log(m))
  .then(async (applied) => {
    console.log(applied.length ? `\nApplied ${applied.length} migration(s).` : '\nNothing to apply.');
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
