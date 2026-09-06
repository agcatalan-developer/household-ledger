// The one repository not scoped to a household — auth runs before a household
// context exists. user_id -> household_id resolution is total because
// household_members has UNIQUE(user_id): one household per user (Phase 2).
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from './pool.js';

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, email, password_hash AS passwordHash, display_name AS displayName
     FROM users WHERE email = ?`,
    [email.toLowerCase()],
  );
  const r = rows[0];
  return r ? { id: r.id, email: r.email, passwordHash: r.passwordHash, displayName: r.displayName } : null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, email, password_hash AS passwordHash, display_name AS displayName
     FROM users WHERE id = ?`,
    [id],
  );
  const r = rows[0];
  return r ? { id: r.id, email: r.email, passwordHash: r.passwordHash, displayName: r.displayName } : null;
}

export async function householdIdForUser(userId: string): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT household_id AS householdId FROM household_members WHERE user_id = ?`,
    [userId],
  );
  return rows[0]?.householdId ?? null;
}

export async function updatePassword(userId: string, passwordHash: string): Promise<void> {
  await pool.query<ResultSetHeader>(`UPDATE users SET password_hash = ? WHERE id = ?`, [
    passwordHash,
    userId,
  ]);
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  await pool.query<ResultSetHeader>(`UPDATE users SET display_name = ? WHERE id = ?`, [
    displayName,
    userId,
  ]);
}
