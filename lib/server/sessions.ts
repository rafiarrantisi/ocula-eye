import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Anonymous HMAC-signed session tokens for the PART03 imaging slice.
// Token wire format: `v1.<sessionId>.<expiresAtSec>.<signatureHex>` where
// signature = HMAC-SHA256(secret, `${sessionId}.${expiresAtSec}`).
// Issuance is gated by PREVIEW_TOKEN: when the server sets PREVIEW_TOKEN,
// callers must present the matching preview token to mint a session.

export const SESSION_COOKIE = 'imaging_session';
const TOKEN_VERSION = 'v1';
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

export interface VerifiedSession {
  sessionId: string;
  expiresAtSec: number;
}

function signingSecret(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.PREVIEW_TOKEN;
  if (!secret) {
    throw new Error(
      'No session signing secret configured; set SESSION_SECRET (or PREVIEW_TOKEN as a dev fallback).',
    );
  }
  return secret;
}

function sign(sessionId: string, expiresAtSec: number, secret: string): string {
  return createHmac('sha256', secret).update(`${sessionId}.${expiresAtSec}`).digest('hex');
}

export function mintSessionToken(sessionId: string, expiresAtSec: number, secret?: string): string {
  if (!SESSION_ID_RE.test(sessionId)) throw new Error('Invalid session id.');
  if (!Number.isInteger(expiresAtSec) || expiresAtSec <= 0) throw new Error('Invalid expiry.');
  const key = secret ?? signingSecret();
  return `${TOKEN_VERSION}.${sessionId}.${String(expiresAtSec)}.${sign(sessionId, expiresAtSec, key)}`;
}

export function verifySessionToken(token: string, secret?: string): VerifiedSession | null {
  const key = secret ?? signingSecret();
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;
  const [, sessionId, expiresRaw, signature] = parts;
  if (!SESSION_ID_RE.test(sessionId)) return null;
  const expiresAtSec = Number(expiresRaw);
  if (!Number.isInteger(expiresAtSec) || expiresAtSec <= 0) return null;
  const expected = sign(sessionId, expiresAtSec, key);
  if (signature.length !== expected.length) return null;
  let ok = false;
  try {
    ok = timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return null;
  }
  if (!ok) return null;
  if (expiresAtSec * 1000 <= Date.now()) return null;
  return { sessionId, expiresAtSec };
}

/** Mint a fresh anonymous session id + token. Throws 401-style when the
 * PREVIEW_TOKEN gate is configured and the presented preview token mismatches. */
export function issueAnonymousSession(
  presentedPreviewToken: string | null,
  opts?: { ttlSec?: number; secret?: string },
): { sessionId: string; token: string; expiresAtSec: number } {
  const gate = process.env.PREVIEW_TOKEN;
  if (gate && presentedPreviewToken !== gate) {
    const err = new Error('Preview token required to issue a session.') as Error & {
      status: number;
      code: string;
    };
    err.status = 401;
    err.code = 'unauthorized';
    throw err;
  }
  const ttlSec = opts?.ttlSec ?? 60 * 60 * 24 * 7;
  const sessionId = randomBytes(16).toString('base64url');
  const expiresAtSec = Math.floor(Date.now() / 1000) + ttlSec;
  return { sessionId, token: mintSessionToken(sessionId, expiresAtSec, opts?.secret), expiresAtSec };
}

export function getSessionTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      const value = part.slice(idx + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export function sessionCookieHeader(token: string, expiresAtSec: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAtSec * 1000).toUTCString()}`;
}
