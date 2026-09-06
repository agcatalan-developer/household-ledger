// Small enough to read in one sitting: list migrations/*.sql sorted by filename,
// compare against schema_migrations, apply each unapplied file, record it.
// No down-migrations — MySQL DDL does not roll back, and a forward fix is always
// simpler for six tables. On a failed first run, drop the database and re-run.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

export async function runMigrations(log: (msg: string) => void = () => {}): Promise<string[]> {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
  });

  const applied: string[] = [];
  try {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let done: Set<string>;
    try {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT filename FROM schema_migrations',
      );
      done = new Set(rows.map((r) => r.filename as string));
    } catch {
      done = new Set(); // schema_migrations does not exist yet; 001 creates it
    }

    for (const file of files) {
      if (done.has(file)) {
        log(`= ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      log(`+ ${file}`);
      await conn.beginTransaction();
      try {
        await conn.query(sql);
        await conn.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
        await conn.commit();
        applied.push(file);
      } catch (err) {
        await conn.rollback().catch(() => {});
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    return applied;
  } finally {
    await conn.end();
  }
}

