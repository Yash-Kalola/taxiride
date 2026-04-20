// Edge-safe session cookie helpers. Uses Web Crypto (SubtleCrypto) so this
// module can be imported from middleware AND server routes without pulling
// in Node-only modules. Password hashing lives in `lib/auth.ts` (Node-only).
//
// Cookie format: `<b64url(payload)>.<b64url(hmac)>`
//   payload = { uid, un, admin, pages, exp }  (exp = unix seconds)
//   hmac    = HMAC-SHA256 over the payload bytes, key = SESSION_SECRET

export const SESSION_COOKIE = 'taxiride_session';

// 14 days — long enough to not be annoying, short enough to force periodic
// re-auth (which is also when updated permissions take effect).
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export interface SessionPayload {
  uid:   string;
  un:    string;
  admin: boolean;
  pages: string[];
  exp:   number;   // unix seconds
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET env var must be set (at least 16 chars)');
  }
  // TS 5.9+ types Uint8Array as Uint8Array<ArrayBufferLike>, but Web Crypto
  // wants a BufferSource (ArrayBuffer or ArrayBufferView<ArrayBuffer>). Cast
  // is runtime-safe — Uint8Array values satisfy BufferSource.
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Build a signed session cookie for a user. */
export async function createSessionCookie(p: Omit<SessionPayload, 'exp'> & { exp?: number }): Promise<string> {
  const payload: SessionPayload = {
    uid:   p.uid,
    un:    p.un,
    admin: p.admin,
    pages: p.pages,
    exp:   p.exp ?? Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await hmacKey();
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, payloadBytes as BufferSource));
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`;
}

/** Return the decoded session if the cookie is valid + unexpired, else null. */
export async function verifySessionCookie(cookie: string | undefined): Promise<SessionPayload | null> {
  if (!cookie) return null;
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;
  try {
    const payloadBytes = b64urlDecode(parts[0]);
    const sigBytes     = b64urlDecode(parts[1]);
    const key = await hmacKey();
    const ok = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, payloadBytes as BufferSource);
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
    if (!payload.uid || typeof payload.exp !== 'number') return null;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
