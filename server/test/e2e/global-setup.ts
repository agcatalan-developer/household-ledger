import mysql from 'mysql2/promise';

// Override with TEST_DATABASE_URL to run the suite against a different engine
// (e.g. the production MariaDB) — the db name is forced to *_test regardless.
export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'mysql://hl:hlpw@localhost:3307/household_ledger_test';

export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_URL = TEST_DB_URL;
  process.env.JWT_SECRET = 'test-secret-abcdefghijklmnopqrstuvwxyz-0123456789';
  process.env.NODE_ENV = 'test';

  const u = new URL(TEST_DB_URL);
  const dbName = u.pathname.replace(/^\//, '');
  const admin = await mysql.createConnection({
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    multipleStatements: true,
  });
  await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await admin.query(`CREATE DATABASE \`${dbName}\``);
  await admin.end();

  const { runMigrations } = await import('../../src/db/migrate.js');
  await runMigrations();

  const { seedUsers } = await import('../../src/db/seed-users.js');
  await seedUsers({
    SEED_A_EMAIL: 'ana@example.com',
    SEED_A_PASSWORD: 'ana-password-1',
    SEED_B_EMAIL: 'ben@example.com',
    SEED_B_PASSWORD: 'ben-password-1',
  });

  // A second household with known ids — the cross-household leak test needs one.
  // Production has exactly one household.
  const { pool } = await import('../../src/db/pool.js');
  const argon2 = (await import('argon2')).default;
  const hash = await argon2.hash('mallory-password-1', { type: argon2.argon2id });
  const H2 = '00000000-0000-4000-8000-0000000000f2';
  const U2 = '00000000-0000-4000-8000-0000000000e2';
  const C2 = '00000000-0000-4000-8000-0000000000c2';
  await pool.query(`INSERT INTO households (id, name, currency) VALUES (?, 'Other', 'PHP')`, [H2]);
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name) VALUES (?, 'mallory@example.com', ?, 'Mallory')`,
    [U2, hash],
  );
  await pool.query(
    `INSERT INTO household_members (household_id, user_id, role) VALUES (?, ?, 'owner')`,
    [H2, U2],
  );
  await pool.query(
    `INSERT INTO categories (id, household_id, name, type, sort_order) VALUES (?, ?, 'Their groceries', 'expense', 10)`,
    [C2, H2],
  );
  await pool.query(
    `INSERT INTO transactions (id, household_id, category_id, amount_minor, txn_date, paid_by, created_by)
     VALUES ('00000000-0000-4000-8000-0000000000d2', ?, ?, 5000, '2026-09-02', ?, ?)`,
    [H2, C2, U2, U2],
  );
  await pool.query(
    `INSERT INTO budget_lines (id, household_id, category_id, category_type, period, planned_minor)
     VALUES ('00000000-0000-4000-8000-0000000000b2', ?, ?, 'expense', '2026-09', 9000)`,
    [H2, C2],
  );
  await pool.end();
}

export const HOUSEHOLD_2 = {
  householdId: '00000000-0000-4000-8000-0000000000f2',
  userId: '00000000-0000-4000-8000-0000000000e2',
  categoryId: '00000000-0000-4000-8000-0000000000c2',
  transactionId: '00000000-0000-4000-8000-0000000000d2',
  budgetLineCategoryId: '00000000-0000-4000-8000-0000000000c2',
};
