import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

// A real argon2id hash of a random string, computed once. Unknown-email logins
// verify against this so response time does not answer "does this account
// exist?" — a malformed hash would throw instantly and leak that timing.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = argon2.hash(randomBytes(24).toString('hex'), { type: argon2.argon2id });
  return dummyHash;
}

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string | null, plain: string): Promise<boolean> {
  const against = hash ?? (await getDummyHash());
  try {
    return await argon2.verify(against, plain);
  } catch {
    return false;
  }
}
