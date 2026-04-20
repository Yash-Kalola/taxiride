// Node-only auth helpers: password hashing (scrypt) and session reading
// from server components / route handlers. Edge-safe session helpers live
// in `lib/auth-session.ts`.

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from './db';
import { verifySessionCookie, SESSION_COOKIE, SessionPayload } from './auth-session';

const SCRYPT_N = 16384;        // ~16 MB RAM
const SCRYPT_KEYLEN = 32;

/** Hash a plaintext password. Returns `scrypt$<saltHex>$<hashHex>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time verify a plaintext password against a stored hash. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(password, salt, expected.length, { N: SCRYPT_N });
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Read the current user's session from the request cookies. Null if not logged in. */
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionCookie(cookie);
}

/** Read the full User row for the current session, or null. */
export async function getCurrentUser() {
  const sess = await getCurrentSession();
  if (!sess) return null;
  return prisma.user.findUnique({ where: { id: sess.uid } }).catch(() => null);
}

/** True if any User row exists — used to decide first-time setup flow. */
export async function hasAnyUsers(): Promise<boolean> {
  try {
    const count = await prisma.user.count();
    return count > 0;
  } catch {
    return false;
  }
}
